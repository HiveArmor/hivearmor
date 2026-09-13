/**
 * telemetry.fixtures — fixture-mode vitals samples for SPEC-02 (W2).
 *
 * The SensorGrid itself reads real backend data, so fixture mode cannot show
 * vitals from a live pipeline. These deterministic fixtures let a developer see
 * every health/sparkline/freshness state without a backend, keyed by agentId:
 *
 *   healthy   — all green, fresh, trending series
 *   degraded  — CPU red + queue amber (proves composite is NOT green)
 *   errored   — lastError set (red errors dimension)
 *   stale     — newest sample is old (amber freshness)
 *   offline   — newest sample very old (red freshness)
 *   novitals  — empty list ("No vitals reported yet", never fake green)
 *
 * Any other agentId falls back to a small healthy series so grids populated
 * with real-looking ids still render something honest in fixture mode.
 *
 * Timestamps are computed relative to load time so freshness stays meaningful
 * across a dev session.
 */

import type { AgentVitalsSample } from './telemetryService';

const NOW = Date.now();
const STEP_MS = 30_000; // agent PUT cadence

/** Builds a newest-first series of `count` samples ending `endAgoMs` before now. */
function series(
  count: number,
  endAgoMs: number,
  gen: (i: number) => Partial<AgentVitalsSample>,
): AgentVitalsSample[] {
  const out: AgentVitalsSample[] = [];
  for (let i = 0; i < count; i += 1) {
    // i=0 is newest.
    const sampledAt = new Date(NOW - endAgoMs - i * STEP_MS).toISOString();
    out.push({
      cpuPct: null,
      ramMb: null,
      queueDepth: null,
      eventsPerSec: null,
      droppedTotal: null,
      lastError: null,
      appliedPolicyId: 1,
      appliedPolicyVersion: 3,
      sampledAt,
      ...gen(i),
    });
  }
  return out;
}

const FIXTURES: Record<string, AgentVitalsSample[]> = {
  healthy: series(24, 0, (i) => ({
    cpuPct: 18 + Math.round(8 * Math.sin(i / 3)),
    ramMb: 512,
    queueDepth: 40 + (i % 5) * 6,
    eventsPerSec: 120 + Math.round(30 * Math.cos(i / 4)),
    droppedTotal: 0,
  })),
  degraded: series(24, 0, (i) => ({
    cpuPct: i === 0 ? 97 : 70 + (i % 6) * 4, // newest is red
    ramMb: 1024,
    queueDepth: i === 0 ? 3200 : 800 + (i % 4) * 120, // newest is amber
    eventsPerSec: 60 + (i % 5) * 10,
    droppedTotal: 12,
  })),
  errored: series(24, 0, (i) => ({
    cpuPct: 22 + (i % 5) * 3,
    ramMb: 640,
    queueDepth: 30,
    eventsPerSec: 90,
    droppedTotal: 4,
    lastError: i === 0 ? 'spool write failed: disk full' : null,
  })),
  stale: series(24, 3 * 60_000, (i) => ({
    cpuPct: 30 + (i % 5) * 3,
    ramMb: 700,
    queueDepth: 55,
    eventsPerSec: 80,
    droppedTotal: 0,
  })),
  offline: series(24, 20 * 60_000, (i) => ({
    cpuPct: 25 + (i % 5) * 3,
    ramMb: 700,
    queueDepth: 55,
    eventsPerSec: 70,
    droppedTotal: 0,
  })),
  novitals: [],
};

/** Returns fixture vitals for a known key, else a small healthy fallback. */
export function getFixtureVitals(agentId: string): AgentVitalsSample[] {
  const key = agentId.toLowerCase();
  for (const name of Object.keys(FIXTURES)) {
    if (key.includes(name)) return FIXTURES[name];
  }
  return FIXTURES.healthy;
}
