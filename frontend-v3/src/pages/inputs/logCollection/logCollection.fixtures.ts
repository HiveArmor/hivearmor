/**
 * Log-Collection Observability fixtures — DESIGN REVIEW ONLY.
 *
 * Enabled solely under VITE_USE_FOUNDATION_FIXTURES in DEV so the layout, chart
 * and honesty notes can be verified without a live stack. Production never
 * receives these records. The detection mapping mirrors the real per-type
 * verdicts (agent/kafka are not rule-addressable → ruleCount null). The rule
 * counts (wineventlog 51, aws 84, azure 54, google/gcp 49, syslog 3) mirror the
 * real per-dataType totals from the /rules recon — reproducible in live mode
 * because the service reads the true X-Total-Count header, not a capped page.
 */

import { resolveDetectionMapping } from './logCollection.observability';
import type { LogCollectionObservability } from './logCollectionObservability.service';

const at = (minutesAgo: number): string =>
  new Date(Date.UTC(2026, 7, 21, 12, 30) - minutesAgo * 60_000).toISOString();

// A gently varying EPS window (newest last) for the sparkline / area chart.
const window = (base: number, jitter: number): number[] =>
  Array.from({ length: 30 }, (_, i) => Math.max(0, Math.round(base + Math.sin(i / 3) * jitter)));

export const logCollectionObservabilityFixture: LogCollectionObservability = {
  snapshotAt: at(0),
  sourcesUnavailable: false,
  fleet: { total: 42, online: 39, offline: 2, unknown: 1, latestSeenAt: at(0), unavailable: false },
  aggregateEpsHistory: window(12800, 900),
  sources: [
    { id: 'src-001', name: 'Endpoint fleet · production', type: 'agent', enabled: true, grpcStatus: 'ok', opensearchStatus: 'ok', eps: 6840, epsHistory: window(6800, 400), lastEventAt: at(0), detection: { mapping: resolveDetectionMapping('agent'), ruleCount: null, errored: false } },
    { id: 'src-002', name: 'Windows security collectors', type: 'wineventlog', enabled: true, grpcStatus: 'ok', opensearchStatus: 'ok', eps: 2860, epsHistory: window(2800, 220), lastEventAt: at(0), detection: { mapping: resolveDetectionMapping('wineventlog'), ruleCount: 51, errored: false } },
    { id: 'src-003', name: 'Core network syslog', type: 'syslog', enabled: true, grpcStatus: 'ok', opensearchStatus: 'ok', eps: 1980, epsHistory: window(1950, 180), lastEventAt: at(1), detection: { mapping: resolveDetectionMapping('syslog'), ruleCount: 3, errored: false } },
    { id: 'src-004', name: 'AWS organization trail', type: 'aws', enabled: true, grpcStatus: 'ok', opensearchStatus: 'unreachable', eps: 742, epsHistory: window(760, 120), lastEventAt: at(18), detection: { mapping: resolveDetectionMapping('aws'), ruleCount: 84, errored: false } },
    { id: 'src-005', name: 'Azure identity audit', type: 'azure', enabled: true, grpcStatus: 'ok', opensearchStatus: 'ok', eps: 318, epsHistory: window(320, 60), lastEventAt: at(2), detection: { mapping: resolveDetectionMapping('azure'), ruleCount: 54, errored: false } },
    { id: 'src-006', name: 'Threat intelligence exchange', type: 'kafka', enabled: true, grpcStatus: 'unreachable', opensearchStatus: 'ok', eps: 76, epsHistory: window(80, 30), lastEventAt: at(3), detection: { mapping: resolveDetectionMapping('kafka'), ruleCount: null, errored: false } },
    { id: 'src-007', name: 'GCP audit archive', type: 'gcp', enabled: false, grpcStatus: 'unreachable', opensearchStatus: 'unreachable', eps: 0, epsHistory: [], lastEventAt: at(420), detection: { mapping: resolveDetectionMapping('gcp'), ruleCount: 49, errored: false } },
  ],
};
