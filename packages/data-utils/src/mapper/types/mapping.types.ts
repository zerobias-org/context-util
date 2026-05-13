import { SourceField, DestinationField } from './field.types.js';
import { TransformConfig } from './transform.types.js';

/**
 * Error handling strategy for mapping failures
 */
export type ErrorHandlingStrategy = 'fail' | 'skip' | 'default';

/**
 * Represents a complete mapping rule from source(s) to destination
 */
export interface MappingRule {
  /** Unique identifier for this mapping rule */
  id: string;
  /** Source field(s) - can be single or multiple for combine operations */
  source: SourceField | SourceField[];
  /** Destination field to map to */
  destination: DestinationField;
  /** Transformation configuration */
  transform: TransformConfig;
  /** Optional description of what this mapping does */
  description?: string;
  /** Whether this mapping is enabled (default: true) */
  enabled?: boolean;
  /** Tags for categorizing mappings */
  tags?: string[];
  /** Error handling strategy */
  errorStrategy?: ErrorHandlingStrategy;
  /** Default value to use when error strategy is 'default' */
  errorDefault?: any;
}

/**
 * Result of applying a mapping rule to data
 */
export interface MappingResult {
  /** The destination field key */
  destinationKey: string;
  /** The transformed value */
  value: any;
  /** Whether the transformation was successful */
  success: boolean;
  /** Error message if transformation failed */
  error?: string;
}

/**
 * A named, reusable SQL query saved at the pipeline level.
 *
 * Pipelines persist these as a `Record<string, PipelineSavedQuery>` on
 * `pipeline.params.queries`, where the map key duplicates the entry's
 * `key` for cheap iteration and direct lookup.
 *
 * Individual data mappings reference a saved query by `sourceQueryKey`
 * (replacing the legacy per-mapping inline `source.sql` field). The
 * pipeline runner resolves the actual SQL by looking the key up in this
 * map at execution time, so a single edit to the query body propagates
 * to every mapping that references it.
 *
 * @example
 * ```ts
 * pipeline.params.queries = {
 *   '9e2…': { key: '9e2…', name: 'Active users', query: 'SELECT * FROM users WHERE active = TRUE' },
 *   '4ab…': { key: '4ab…', name: 'Recent orders', query: 'SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 7 day' },
 * };
 * ```
 */
export interface PipelineSavedQuery {
  /** Stable identifier — typically a UUID generated once on create. Never
   *  user-edited; renames touch `name` only so mapping references via
   *  `sourceQueryKey` don't need to follow a key change. */
  key: string;
  /** User-facing display label shown in dropdowns and mapping rows. */
  name: string;
  /** The SQL body, sent to the producer's `query` function as the `sql`
   *  parameter at run time. */
  query: string;
}
