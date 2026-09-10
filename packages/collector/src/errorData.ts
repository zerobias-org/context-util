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
 * connection's credentials live, so these are never copied. `response.status` is lifted
 * separately, which is the only part of them worth keeping.
 */
const UNSAFE_ERROR_PROPS = new Set(['config', 'request', 'response', 'toJSON']);

/** Stacks and SDK metadata are unbounded; a batch can log thousands of rows. */
const MAX_FIELD_LENGTH = 4096;

function truncate(value: string): string {
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}… [truncated]` : value;
}

function asStatusCode(value: unknown): number | undefined {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isInteger(numeric) ? numeric : undefined;
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
 * Without this the classifier only ever saw the collector's own prose ("Unable to list REST API
 * resources") and had no way to reach the cause underneath it ("Too Many Requests").
 */
export function toBatchLogData(data?: object | Error): Record<string, unknown> {
  if (!data) {
    return {};
  }

  if (!(data instanceof Error)) {
    return data as Record<string, unknown>;
  }

  const error = data as Error & Record<string, any>;
  const message = error.message || String(error);
  const out: Record<string, unknown> = {
    name: error.name,
    message: truncate(message),
    msg: truncate(message),
  };

  if (error.stack) {
    out.stack = truncate(error.stack);
  }

  for (const key of Object.getOwnPropertyNames(error)) {
    if (key in out || UNSAFE_ERROR_PROPS.has(key)) {
      continue;
    }

    const value = error[key];
    out[key] = typeof value === 'string' ? truncate(value) : value;
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
