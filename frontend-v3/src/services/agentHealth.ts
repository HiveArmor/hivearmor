/**
 * agentHealth — pure health-model logic for SPEC-02 (W2).
 *
 * The single hard rule (CrowdStrike RFM lesson, spec §2): "online" must NEVER
 * imply "healthy". The composite badge is the WORST of the dimensions it can
 * evaluate — it can only be green when every evaluable dimension is green, and
 * it ALWAYS carries the failing dimension + a human reason. A green badge that
 * hides a degraded dimension is the exact trap this module forbids by
 * construction (see `computeCompositeHealth`).
 *
 * "No vitals reported yet" and "vitals fetch error" are FIRST-CLASS states,
 * distinct from green — an agent that never reported is `unknown`, not healthy.
 *
 * Pure functions only: no React, no I/O, `now` is injectable for deterministic
 * tests. Thresholds live here as named constants so tuning is one edit.
 */

import type { AgentVitalsSample } from '@/services/telemetryService';

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/**
 * Health levels, ordered worst→best is the REVERSE of this severity ordering.
 * `unknown` is deliberately NOT green: absence of signal is not health.
 */
export type HealthLevel = 'red' | 'amber' | 'green' | 'unknown';

/** Severity rank — higher is worse. Used to take the worst dimension. */
const LEVEL_RANK: Record<HealthLevel, number> = {
  green: 0,
  unknown: 1,
  amber: 2,
  red: 3,
};

/** Returns the worse (higher-rank) of two levels. */
export function worseLevel(a: HealthLevel, b: HealthLevel): HealthLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Thresholds (spec §2/§3) — one place to tune.
// ---------------------------------------------------------------------------

export const HEALTH_THRESHOLDS = {
  /** CPU% amber/red. */
  cpuAmber: 80,
  cpuRed: 95,
  /** Queue depth (events buffered) amber/red — backpressure signal. */
  queueAmber: 1_000,
  queueRed: 10_000,
  /** Freshness: Stale (amber) then Offline (red), from last sample age. */
  staleAfterMs: 2 * 60_000, // 2 min — agent PUTs every 30s, so >2m = missed several
  offlineAfterMs: 5 * 60_000, // 5 min — matches agent-manager 1-min heartbeat with margin
} as const;

// ---------------------------------------------------------------------------
// Dimension model
// ---------------------------------------------------------------------------

export type HealthDimensionId = 'freshness' | 'cpu' | 'memory' | 'queue' | 'eps' | 'errors';

export interface HealthDimension {
  id: HealthDimensionId;
  /** Human label for the pill, e.g. "CPU". */
  label: string;
  level: HealthLevel;
  /** Human reason shown when the dimension is not green, e.g. "CPU 97%". */
  reason: string;
  /** ISO timestamp of the sample this dimension was evaluated from (last check). */
  lastCheck: string | null;
}

export interface CompositeHealth {
  level: HealthLevel;
  /** The dimension driving the composite level (worst), or null when unknown/empty. */
  worst: HealthDimension | null;
  /** One-line human reason for the composite, always populated. */
  reason: string;
  /** Every evaluated dimension, for the per-dimension pills. */
  dimensions: HealthDimension[];
  /** True when the agent has never reported any vitals sample. */
  noVitals: boolean;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export type FreshnessLevel = 'fresh' | 'stale' | 'offline' | 'unknown';

export interface Freshness {
  level: FreshnessLevel;
  /** Age of the newest sample in ms, or null when there is no sample. */
  ageMs: number | null;
  /** ISO timestamp of the newest sample. */
  lastSeen: string | null;
}

/**
 * Classifies freshness from the newest sample's `sampledAt`.
 * No sample → `unknown` (never "fresh"). Future skew reads as fresh (age 0).
 */
export function computeFreshness(
  samples: AgentVitalsSample[],
  now: number = Date.now(),
): Freshness {
  const newest = samples[0]; // backend returns newest-first
  const lastSeen = newest?.sampledAt ?? null;
  if (!lastSeen) {
    return { level: 'unknown', ageMs: null, lastSeen: null };
  }
  const ts = new Date(lastSeen).getTime();
  if (Number.isNaN(ts)) {
    return { level: 'unknown', ageMs: null, lastSeen: null };
  }
  const ageMs = Math.max(0, now - ts);
  let level: FreshnessLevel = 'fresh';
  if (ageMs >= HEALTH_THRESHOLDS.offlineAfterMs) level = 'offline';
  else if (ageMs >= HEALTH_THRESHOLDS.staleAfterMs) level = 'stale';
  return { level, ageMs, lastSeen };
}

// ---------------------------------------------------------------------------
// Per-dimension evaluation
// ---------------------------------------------------------------------------

function freshnessDimension(fresh: Freshness): HealthDimension {
  let level: HealthLevel;
  let reason: string;
  switch (fresh.level) {
    case 'offline':
      level = 'red';
      reason = 'No vitals for over 5 min — sensor may be offline';
      break;
    case 'stale':
      level = 'amber';
      reason = 'Vitals stale (last sample over 2 min ago)';
      break;
    case 'fresh':
      level = 'green';
      reason = 'Reporting on schedule';
      break;
    default:
      level = 'unknown';
      reason = 'No vitals reported yet';
      break;
  }
  return { id: 'freshness', label: 'Freshness', level, reason, lastCheck: fresh.lastSeen };
}

function bandedDimension(
  id: HealthDimensionId,
  label: string,
  value: number | null,
  amber: number,
  red: number,
  fmt: (v: number) => string,
  lastCheck: string | null,
): HealthDimension {
  if (value === null) {
    return { id, label, level: 'unknown', reason: `${label} not reported`, lastCheck };
  }
  let level: HealthLevel = 'green';
  if (value >= red) level = 'red';
  else if (value >= amber) level = 'amber';
  const reason = level === 'green' ? `${label} ${fmt(value)}` : `${label} ${fmt(value)} (high)`;
  return { id, label, level, reason, lastCheck };
}

function errorsDimension(lastError: string | null, lastCheck: string | null): HealthDimension {
  if (lastError) {
    return {
      id: 'errors',
      label: 'Errors',
      level: 'red',
      reason: `Agent reported: ${lastError}`,
      lastCheck,
    };
  }
  return { id: 'errors', label: 'Errors', level: 'green', reason: 'No errors reported', lastCheck };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

/**
 * Computes the composite health from the vitals samples (newest-first).
 *
 * Guarantees (asserted by tests):
 *  - Empty samples → `unknown` + `noVitals: true` (NEVER green).
 *  - The composite `level` is the WORST evaluable dimension — so it can never
 *    be green while any dimension is red (the RFM trap).
 *  - `reason` is always populated; when not green it names the failing dimension.
 */
export function computeCompositeHealth(
  samples: AgentVitalsSample[],
  now: number = Date.now(),
): CompositeHealth {
  if (samples.length === 0) {
    return {
      level: 'unknown',
      worst: null,
      reason: 'No vitals reported yet',
      dimensions: [],
      noVitals: true,
    };
  }

  const newest = samples[0];
  const fresh = computeFreshness(samples, now);
  const at = newest.sampledAt;

  const dimensions: HealthDimension[] = [
    freshnessDimension(fresh),
    bandedDimension('cpu', 'CPU', newest.cpuPct, HEALTH_THRESHOLDS.cpuAmber, HEALTH_THRESHOLDS.cpuRed, (v) => `${Math.round(v)}%`, at),
    bandedDimension('queue', 'Queue', newest.queueDepth, HEALTH_THRESHOLDS.queueAmber, HEALTH_THRESHOLDS.queueRed, (v) => `${Math.round(v)}`, at),
    errorsDimension(newest.lastError, at),
  ];

  // Composite = worst dimension. Never green while any dimension is red/amber.
  const level = dimensions.reduce<HealthLevel>((acc, d) => worseLevel(acc, d.level), 'green');

  // The worst dimension drives the reason (highest rank; first wins on tie).
  const worst = dimensions.reduce<HealthDimension | null>((acc, d) => {
    if (d.level === 'green') return acc;
    if (acc === null) return d;
    return LEVEL_RANK[d.level] > LEVEL_RANK[acc.level] ? d : acc;
  }, null);

  const reason =
    level === 'green'
      ? 'All dimensions healthy'
      : worst
        ? worst.reason
        : 'Degraded';

  return { level, worst, reason, dimensions, noVitals: false };
}

// ---------------------------------------------------------------------------
// Sparkline extraction — chronological (oldest→newest) for left-to-right charts.
// ---------------------------------------------------------------------------

export type TrendedSignal = 'cpu' | 'eps' | 'queue';

/**
 * Extracts a chronological numeric series for a trended signal (CPU / EPS /
 * queue depth). Samples arrive newest-first, so this reverses to oldest-first
 * and drops null gaps. Returns `[]` when nothing is plottable.
 */
export function extractSparklineSeries(
  samples: AgentVitalsSample[],
  signal: TrendedSignal,
): number[] {
  const pick = (s: AgentVitalsSample): number | null =>
    signal === 'cpu' ? s.cpuPct : signal === 'eps' ? s.eventsPerSec : s.queueDepth;
  return [...samples]
    .reverse()
    .map(pick)
    .filter((v): v is number => v !== null);
}
