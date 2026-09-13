/**
 * telemetryService — agent vitals read API (SPEC-02, W2).
 *
 * Consumes the ALREADY-BUILT but previously-unwired backend endpoint
 * `GET /api/ha-telemetry/vitals/{agentId}` (guarded ROLE_ADMIN/SOC_MANAGER/
 * ANALYST/USER). The endpoint returns up to 144 vitals samples, NEWEST-FIRST,
 * each serialized as a raw JDBC column map — so keys are snake_case exactly as
 * the SQL SELECT names them in `HaTelemetryService.getRecentVitals`:
 *
 *   SELECT cpu_pct, ram_mb, queue_depth, events_per_sec, dropped_total,
 *          last_error, applied_policy_id, applied_policy_version, sampled_at
 *
 * The DTO below is typed FROM that query — no invented fields. Numeric columns
 * arrive as JSON numbers; `last_error` is nullable text; the policy columns are
 * nullable; `sampled_at` is an ISO timestamp string.
 *
 * All requests route through the shared `apiClient`, which injects the JWT and
 * the `X-Tenant-ID` authorization claim — never an absolute backend URL.
 */

import { apiClient } from '@/lib/apiClient';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Raw wire row from `GET /api/ha-telemetry/vitals/{agentId}`.
 * Keys are snake_case (JdbcTemplate.queryForList column names, serialized verbatim).
 * Every field is optional/nullable because a raw column map makes no shape guarantee.
 */
export interface AgentVitalsWireRow {
  cpu_pct?: number | null;
  ram_mb?: number | null;
  queue_depth?: number | null;
  events_per_sec?: number | null;
  dropped_total?: number | null;
  last_error?: string | null;
  applied_policy_id?: number | null;
  applied_policy_version?: number | null;
  sampled_at?: string | null;
}

/** Canonical camelCase UI projection of one vitals sample. */
export interface AgentVitalsSample {
  cpuPct: number | null;
  ramMb: number | null;
  queueDepth: number | null;
  eventsPerSec: number | null;
  droppedTotal: number | null;
  lastError: string | null;
  appliedPolicyId: number | null;
  appliedPolicyVersion: number | null;
  /** ISO timestamp the sample was taken (server clock). */
  sampledAt: string | null;
}

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Adapts one raw snake_case wire row into the camelCase UI projection.
 * Exported for direct unit testing of the mapping.
 */
export function adaptVitalsRow(row: AgentVitalsWireRow): AgentVitalsSample {
  return {
    cpuPct: num(row.cpu_pct),
    ramMb: num(row.ram_mb),
    queueDepth: num(row.queue_depth),
    eventsPerSec: num(row.events_per_sec),
    droppedTotal: num(row.dropped_total),
    lastError: str(row.last_error),
    appliedPolicyId: num(row.applied_policy_id),
    appliedPolicyVersion: num(row.applied_policy_version),
    sampledAt: str(row.sampled_at),
  };
}

/**
 * Fetches recent vitals samples for one agent, NEWEST-FIRST (as the backend
 * returns them). Returns `[]` when the agent has never reported vitals — the
 * caller distinguishes "no vitals yet" from a fetch error via the thrown
 * `ApiError`, never by conflating an empty list with health.
 *
 * @param agentId agent identifier (the same id the SensorGrid rows key on)
 * @param signal  optional AbortSignal for query cancellation
 */
export async function fetchAgentVitals(
  agentId: string,
  signal?: AbortSignal,
): Promise<AgentVitalsSample[]> {
  if (fixtureMode) {
    const { getFixtureVitals } = await import('./telemetry.fixtures');
    return getFixtureVitals(agentId);
  }
  const rows = await apiClient.get<AgentVitalsWireRow[]>(
    `/ha-telemetry/vitals/${encodeURIComponent(agentId)}`,
    { signal },
  );
  return (Array.isArray(rows) ? rows : []).map(adaptVitalsRow);
}
