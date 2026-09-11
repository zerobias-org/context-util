/**
 * Turns whatever a collector hands `batch.error(...)` into something that survives JSON.
 *
 * `Error` defines `name`, `message` and `stack` as non-enumerable own properties, so
 * `JSON.stringify(err)` is `"{}"`. The batch log APIs spread their body straight into axios,
 * which means every error a collector reported was written to `importbatch.batch_log.data` as an
 * empty object — the cause existed only in the container log, which nothing downstream reads.
 */

/**
 * Axios hangs the outbound request on the error, `config.headers` included. That is where the
 * connection's credentials live, so these are dropped at EVERY level rather than just the top:
 * a wrapped error puts the original on `cause`, and `cause` is an own property that
 * `getOwnPropertyNames` finds, so a top-level-only filter hands the token straight back.
 * `response.status` is lifted separately, which is the only part of them worth keeping.
 */
const UNSAFE_ERROR_PROPS = new Set(['config', 'request', 'response', 'toJSON']);

/** Stacks and SDK metadata are unbounded; a batch can log thousands of rows. */
const MAX_FIELD_LENGTH = 4096;

/** Nested causes are worth keeping, but not to an arbitrary depth. */
const MAX_DEPTH = 4;

/** Arrays in SDK errors (validation details, retry attempts) can be long. */
const MAX_ARRAY_LENGTH = 50;

/** Last-resort ceiling on the whole payload, enforced after the walk. */
const MAX_SERIALIZED_LENGTH = 16_384;

function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}… [truncated]` : value;
}

function asStatusCode(value: unknown): number | undefined {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isInteger(numeric) ? numeric : undefined;
}

/**
 * One value, made safe to stringify: bounded in depth, breadth and length, with cycles replaced
 * rather than thrown on.
 *
 * `path` holds only the ancestors currently being walked, so a genuinely shared object appears in
 * full under each parent and only a true cycle is cut.
 */
function sanitize(value: unknown, depth: number, path: Set<object>): unknown {
  if (typeof value === 'string') {
    return truncate(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const object = value as object;
  if (path.has(object)) {
    return '[circular]';
  }

  if (depth >= MAX_DEPTH) {
    return '[truncated: max depth]';
  }

  path.add(object);
  try {
    if (value instanceof Error) {
      return flattenError(value, depth, path);
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitize(entry, depth + 1, path));
      return value.length > MAX_ARRAY_LENGTH
        ? [...items, `[truncated: ${value.length - MAX_ARRAY_LENGTH} more]`]
        : items;
    }

    const out: Record<string, unknown> = {};
    for (const key of ownKeys(object)) {
      if (UNSAFE_ERROR_PROPS.has(key)) {
        continue;
      }

      out[key] = readAndSanitize(object as Record<string, unknown>, key, depth + 1, path);
    }

    return out;
  } finally {
    path.delete(object);
  }
}

/**
 * Own keys, or none. A Proxy can throw from its `ownKeys` trap, and losing the whole payload to a
 * hostile object in a field nobody asked about is the wrong trade.
 */
function ownKeys(object: object, includeNonEnumerable = false): string[] {
  try {
    return includeNonEnumerable ? Object.getOwnPropertyNames(object) : Object.keys(object);
  } catch {
    return [];
  }
}

/**
 * One property, sanitized, with the read itself guarded.
 *
 * A getter can throw, and so can a Proxy's `get` trap. Catching per property rather than around
 * the whole walk keeps a single hostile field from costing the message and statusCode the
 * classifier actually reads.
 */
function readAndSanitize(
  object: Record<string, unknown>,
  key: string,
  depth: number,
  path: Set<object>,
): unknown {
  try {
    return sanitize(object[key], depth, path);
  } catch {
    return '[unreadable]';
  }
}

/** The Error shape, including the non-enumerable fields JSON.stringify drops. */
function flattenError(error: Error & Record<string, any>, depth: number, path: Set<object>): Record<string, unknown> {
  const message = error.message || String(error);
  const out: Record<string, unknown> = {
    name: error.name,
    message: truncate(message),
    msg: truncate(message),
  };

  if (error.stack) {
    out.stack = truncate(error.stack);
  }

  for (const key of ownKeys(error, true)) {
    if (key in out || UNSAFE_ERROR_PROPS.has(key)) {
      continue;
    }

    out[key] = readAndSanitize(error, key, depth + 1, path);
  }

  const statusCode = asStatusCode(error.statusCode)
    ?? asStatusCode(error._model?.statusCode)
    ?? asStatusCode(error.response?.status);
  if (statusCode !== undefined) {
    out.statusCode = statusCode;
  }

  const key = error.key ?? error._model?.key;
  if (typeof key === 'string') {
    out.key = key;
  }

  return out;
}

/**
 * The flattened error, keyed the way platform's retry classifier reads it.
 *
 * That classifier maps a batch log row onto `{ message, transient: data.transient, _model: data }`
 * and then reads `_model.msg`, `_model.key` and `_model.statusCode` — so `msg`, `key` and
 * `statusCode` have to sit at the TOP level of `data`, not nested under a `_model` of their own.
 * `msg` duplicates `message` deliberately: `message` is what a person reads in the UI, `msg` is
 * what gets folded into the classifier's haystack.
 *
 * Nothing here may throw. This runs while a collector is already reporting a failure, and the
 * previous `data ?? {}` could not fail — so a cycle, a bigint or an exotic value has to degrade to
 * a marker rather than take out the error report with it.
 */
export function toBatchLogData(data?: object | Error): Record<string, unknown> {
  if (!data) {
    return {};
  }

  let out: Record<string, unknown>;
  try {
    out = data instanceof Error
      ? flattenError(data as Error & Record<string, any>, 0, new Set())
      : (sanitize(data, 0, new Set()) as Record<string, unknown>);
  } catch {
    return { name: 'UnserializableError', message: 'Error payload could not be serialized' };
  }

  try {
    const serialized = JSON.stringify(out);
    if (serialized !== undefined && serialized.length > MAX_SERIALIZED_LENGTH) {
      return {
        name: out.name,
        message: out.message,
        msg: out.msg,
        statusCode: out.statusCode,
        key: out.key,
        truncated: `payload was ${serialized.length} bytes`,
      };
    }
  } catch {
    return { name: out.name ?? 'Error', message: out.message ?? 'Error payload could not be serialized' };
  }

  return out;
}
