/**
 * Data Source Status — shared TypeScript type definitions.
 *
 * These shapes mirror the backend DTOs under
 * com.hivearmor.service.dto.inputs exactly.
 *
 * Invariants:
 *   - HaDataSourceType is a closed union — no `string` fallback, no `any`.
 *   - HaDataSourceHealth is a closed union: 'ok' | 'unreachable'.
 *   - epsHistory is bounded to EPS_WINDOW_SIZE samples.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 10.1, 10.4, 10.5, 13.8
 */

// ── Source type ────────────────────────────────────────────────────────────

/**
 * Discriminated union of all supported data source types.
 * Must match the backend HaDataSource.type domain values exactly.
 */
export type HaDataSourceType =
  | 'syslog'
  | 'wineventlog'
  | 'agent'
  | 'kafka'
  | 'aws'
  | 'azure'
  | 'gcp';

// ── Health ─────────────────────────────────────────────────────────────────

/**
 * Per-source health status — reported independently for gRPC and OpenSearch.
 * - ok          : the adapter successfully reached the subsystem.
 * - unreachable : the adapter's try/catch caught an exception (Req 8.3, 8.4).
 */
export type HaDataSourceHealth = 'ok' | 'unreachable';

// ── Record (list) ──────────────────────────────────────────────────────────

/**
 * Aggregated data source record returned by GET /api/ha-inputs/sources.
 *
 * Combines agent-manager gRPC telemetry with OpenSearch ingest statistics
 * into a single shape (Req 8.6, 9.2).
 */
export interface HaDataSourceRecord {
  /** UUID of the data source. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Type of data source — determines config shape and collection mechanism. */
  type: HaDataSourceType;
  /** gRPC health of the agent-manager connection for this source. */
  grpcStatus: HaDataSourceHealth;
  /** OpenSearch ingest health for this source. */
  opensearchStatus: HaDataSourceHealth;
  /** Current events-per-second rate, or 0 when OpenSearch is unreachable. */
  eps: number;
  /**
   * Rolling history of EPS samples.
   * Length is bounded to EPS_WINDOW_SIZE (60 samples at 30 s cadence = 30 min).
   */
  epsHistory: number[];
  /** ISO-8601 timestamp of the most recent ingested event, or null. */
  lastEventAt: string | null;
  /** Whether the source is enabled for collection. */
  enabled: boolean;
}

// ── Create payload ─────────────────────────────────────────────────────────

/**
 * Request body for POST /api/ha-inputs/sources (AddDataSourceWizard finish step).
 *
 * config keys and values are type-specific — the wizard collects them in Step 2
 * based on REQUIRED_FIELDS[type].  All values are strings at the wire level;
 * the backend coerces them to the appropriate types.
 */
export interface HaDataSourceCreatePayload {
  /** Human-readable display name — 1..128 characters. */
  name: string;
  /** Data source type — determines which config fields are required. */
  type: HaDataSourceType;
  /**
   * Type-specific configuration map.
   * Keys and allowed values depend on `type`; the backend validates them.
   * All values are strings at the wire level.
   */
  config: Record<string, string>;
  /** Whether the source should begin collecting immediately after creation. */
  enabled: boolean;
}
