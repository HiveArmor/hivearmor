/**
 * SYNTHETIC design fixtures for the cross-fleet posture report (SPEC-PT-6).
 *
 * ⚠️ FICTIONAL DATA — rendered ONLY in a DEV build with
 * `VITE_USE_FOUNDATION_FIXTURES=true` so the offline Fleet Posture Report shows
 * populated CIS/vuln cards, a pass-rate trend and a per-host grid. Invented for visual
 * review; NOT a real fleet rollup and NEVER shipped in production (prod alias throws).
 * A fleet score here is fictional and is not proof of fleet-wide compliance.
 */

import type {
  FleetCisPostureDTO,
  FleetPostureOverviewDTO,
  HostCisPosture,
  PostureTrendDTO,
} from '@/types/postureReport.types';

const SNAPSHOT = '2026-10-22T06:00:00Z';

const HOSTS: HostCisPosture[] = [
  host('agent-fixture-1', 'FIN-WKS-044', 'linux', true, 212, 171, 28, 3, 8, 2, 85.9),
  host('agent-fixture-2', 'research-k8s-node-03', 'linux', true, 212, 150, 50, 2, 8, 2, 75.0),
  host('agent-fixture-3', 'PAY-APP-07', 'linux', true, 212, 198, 6, 0, 6, 2, 97.1),
  host('agent-fixture-4', 'corp-edge-fw-02', 'windows', true, 180, 120, 55, 1, 3, 1, 68.6),
  // honest not-covered host — never a fabricated 100%
  { agentId: 'agent-fixture-5', hostname: 'warehouse-camera-14', platform: 'linux', scanned: false, total: 0, passCount: 0, failCount: 0, errorCount: 0, naCount: 0, notCheckedCount: 0, scorePct: null, profile: null, benchmark: null, scannedAt: null },
];

const FLEET_CIS: FleetCisPostureDTO = {
  fleetHostCount: 5,
  hostsScanned: 4,
  hostsNotScanned: 1,
  total: 816,
  passCount: 639,
  failCount: 139,
  errorCount: 6,
  naCount: 25,
  notCheckedCount: 7,
  fleetScorePct: 82.1,
  lastScannedAt: SNAPSHOT,
  hosts: HOSTS,
};

export function foundationFleetCis(): FleetCisPostureDTO {
  return FLEET_CIS;
}

export function foundationPostureOverview(): FleetPostureOverviewDTO {
  return {
    snapshotAt: SNAPSHOT,
    cis: FLEET_CIS,
    vuln: {
      critical: 4,
      high: 19,
      medium: 47,
      low: 88,
      info: 12,
      kevCount: 3,
      affectedAgents: 4,
      snapshotAt: SNAPSHOT,
      topCves: [
        { cveId: 'CVE-2026-1234', cvssV3: 9.8, severity: 'critical', kev: true, affectedAgents: 3 },
        { cveId: 'CVE-2026-5678', cvssV3: 8.1, severity: 'high', kev: false, affectedAgents: 2 },
        { cveId: 'CVE-2026-9012', cvssV3: 7.5, severity: 'high', kev: true, affectedAgents: 1 },
      ],
    },
    coverage: {
      fleetHostCount: 5,
      hostsWithCis: 4,
      hostsWithVuln: 4,
      hostsUncovered: 1,
    },
  };
}

export function foundationPostureTrend(days = 90): PostureTrendDTO {
  // Build a gently-improving pass-rate series across the window.
  const points = [];
  const buckets = Math.min(12, Math.max(4, Math.floor(days / 7)));
  for (let i = 0; i < buckets; i++) {
    const d = new Date(Date.UTC(2026, 9, 22) - (buckets - 1 - i) * 7 * 86_400_000);
    const score = 74 + i * (8 / buckets); // ~74% → ~82%
    points.push({
      bucket: d.toISOString().slice(0, 10),
      passCount: Math.round(620 + i * 2),
      failCount: Math.round(160 - i * 2),
      errorCount: 6,
      scorePct: Math.round(score * 10) / 10,
      hostsScanned: 4,
    });
  }
  const first = points[0].scorePct ?? 0;
  const last = points[points.length - 1].scorePct ?? 0;
  return {
    interval: `${days}d`,
    cisScore: points,
    driftAvailable: true,
    cisScoreDrift: Math.round((last - first) * 10) / 10,
    failCountDrift: (points[points.length - 1].failCount ?? 0) - (points[0].failCount ?? 0),
  };
}

function host(
  agentId: string,
  hostname: string,
  platform: string,
  scanned: boolean,
  total: number,
  passCount: number,
  failCount: number,
  errorCount: number,
  naCount: number,
  notCheckedCount: number,
  scorePct: number | null,
): HostCisPosture {
  return {
    agentId,
    hostname,
    platform,
    scanned,
    total,
    passCount,
    failCount,
    errorCount,
    naCount,
    notCheckedCount,
    scorePct,
    profile: 'cis_level1_server',
    benchmark: 'CIS Benchmark [FIXTURE]',
    scannedAt: SNAPSHOT,
  };
}
