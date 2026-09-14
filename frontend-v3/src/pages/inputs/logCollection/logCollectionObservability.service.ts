/**
 * Log-Collection Observability service (SPEC-09 / W8).
 *
 * Composes ONLY verified backend endpoints into the analyst view-model:
 *   - GET /api/ha-inputs/sources        → per-source inventory, EPS, epsHistory[], last-event, reachability
 *   - GET /api/agent-manager/agents     → fleet liveness (status, lastSeen) — fleet-level only, no source join
 *   - GET /api/correlation-rule/search-by-filters?dataTypes=<t> → rules consuming a dataType (Q8, matched types only)
 *
 * No invented APIs, no fabricated pipeline health. Detection counts are fetched
 * only for source types with a proven rule-dataType mapping; unmatched types
 * carry a note instead of a misleading zero.
 */

import { resolveDetectionMapping } from './logCollection.observability';
import type { DetectionMapping } from './logCollection.observability';

import { countRulesByFilters } from '@/services/correlation-rules.service';
import { dataSourcesService } from '@/services/dataSources.service';
import { fetchSensors } from '@/services/sensorsService';
import type { HaDataSourceRecord, HaDataSourceType } from '@/types/dataSource.types';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/** Fleet-level liveness roll-up — NOT attributed to any single source (no join key exists). */
export interface FleetLiveness {
  total: number;
  online: number;
  offline: number;
  unknown: number;
  /** Newest last-seen across the fleet, or null. */
  latestSeenAt: string | null;
  /** True when the agent-manager fleet endpoint could not be read. */
  unavailable: boolean;
}

/** How Q8 (detections consuming) resolves for one source. */
export interface DetectionConsumption {
  mapping: DetectionMapping;
  /** Rule count when the type is addressable and the query succeeded; null otherwise. */
  ruleCount: number | null;
  /** True when the query was attempted but failed (fail-closed → not_reported, not zero). */
  errored: boolean;
}

/** One row of the collection-health table. */
export interface CollectionSourceRow {
  id: string;
  name: string;
  type: HaDataSourceType;
  enabled: boolean;
  /** Adapter reachability — reachable is NOT health. */
  grpcStatus: HaDataSourceRecord['grpcStatus'];
  opensearchStatus: HaDataSourceRecord['opensearchStatus'];
  eps: number;
  epsHistory: number[];
  lastEventAt: string | null;
  detection: DetectionConsumption;
}

export interface LogCollectionObservability {
  sources: CollectionSourceRow[];
  fleet: FleetLiveness;
  /** Aggregate EPS history summed across enabled sources, for the ingest-volume chart. */
  aggregateEpsHistory: number[];
  snapshotAt: string;
  /** True when the source inventory itself could not be read. */
  sourcesUnavailable: boolean;
}

function summariseFleet(
  statuses: { connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'; lastSeen: string | null }[],
): FleetLiveness {
  let online = 0;
  let offline = 0;
  let unknown = 0;
  let latestSeenAt: string | null = null;
  for (const s of statuses) {
    if (s.connectionStatus === 'ONLINE') online += 1;
    else if (s.connectionStatus === 'OFFLINE') offline += 1;
    else unknown += 1;
    if (s.lastSeen && (!latestSeenAt || s.lastSeen > latestSeenAt)) latestSeenAt = s.lastSeen;
  }
  return { total: statuses.length, online, offline, unknown, latestSeenAt, unavailable: false };
}

/** Sum per-index EPS history samples into one aggregate series (bounded to the longest source window). */
function aggregateEps(sources: HaDataSourceRecord[]): number[] {
  const maxLen = sources.reduce((m, s) => Math.max(m, s.epsHistory?.length ?? 0), 0);
  if (maxLen === 0) return [];
  const out = new Array<number>(maxLen).fill(0);
  for (const s of sources) {
    if (!s.enabled) continue;
    const hist = s.epsHistory ?? [];
    // Right-align: newest samples line up at the end of the window.
    const offset = maxLen - hist.length;
    for (let i = 0; i < hist.length; i += 1) out[offset + i] += hist[i] ?? 0;
  }
  return out;
}

async function resolveDetection(type: HaDataSourceType): Promise<DetectionConsumption> {
  const mapping = resolveDetectionMapping(type);
  if (mapping.kind !== 'matched' || !mapping.dataType) {
    return { mapping, ruleCount: null, errored: false };
  }
  try {
    // Read the TRUE total from X-Total-Count — the endpoint is paginated, so a
    // page-body length would silently cap at the default page size (20).
    const total = await countRulesByFilters({ dataTypes: [mapping.dataType] });
    return { mapping, ruleCount: total, errored: false };
  } catch {
    // Fail-closed: an unreadable rule query is "not reported", never a fabricated 0.
    return { mapping, ruleCount: null, errored: true };
  }
}

async function listLive(): Promise<LogCollectionObservability> {
  const snapshotAt = new Date().toISOString();

  const sourcesResult = await Promise.allSettled([dataSourcesService.list()]);
  const sources: HaDataSourceRecord[] =
    sourcesResult[0].status === 'fulfilled' ? sourcesResult[0].value : [];
  const sourcesUnavailable = sourcesResult[0].status === 'rejected';

  // Fleet liveness (best-effort; a rejection is surfaced as "unavailable", not faked).
  let fleet: FleetLiveness;
  try {
    const { sensors } = await fetchSensors({ size: 500 });
    fleet = summariseFleet(sensors.map((s) => ({ connectionStatus: s.connectionStatus, lastSeen: s.lastSeen })));
  } catch {
    fleet = { total: 0, online: 0, offline: 0, unknown: 0, latestSeenAt: null, unavailable: true };
  }

  // Detection consumption per source. Resolve once per distinct source type
  // (sources sharing a type share the same rule-count query) to avoid N
  // identical probes when several sources are e.g. `aws`.
  const distinctTypes = Array.from(new Set(sources.map((s) => s.type)));
  const detectionByType = new Map<HaDataSourceType, DetectionConsumption>(
    await Promise.all(
      distinctTypes.map(async (type): Promise<[HaDataSourceType, DetectionConsumption]> => [type, await resolveDetection(type)]),
    ),
  );
  const rows: CollectionSourceRow[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    enabled: s.enabled,
    grpcStatus: s.grpcStatus,
    opensearchStatus: s.opensearchStatus,
    eps: s.eps,
    epsHistory: s.epsHistory ?? [],
    lastEventAt: s.lastEventAt,
    detection: detectionByType.get(s.type) ?? { mapping: resolveDetectionMapping(s.type), ruleCount: null, errored: false },
  }));

  return {
    sources: rows,
    fleet,
    aggregateEpsHistory: aggregateEps(sources),
    snapshotAt,
    sourcesUnavailable,
  };
}

export const logCollectionObservabilityService = {
  fixtureMode,
  async load(): Promise<LogCollectionObservability> {
    if (fixtureMode) {
      const { logCollectionObservabilityFixture } = await import('./logCollection.fixtures');
      return structuredClone(logCollectionObservabilityFixture);
    }
    return listLive();
  },
};
