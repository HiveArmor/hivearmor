/**
 * SYNTHETIC design fixtures for the per-host vulnerability findings card (PT-5 Posture
 * tab, served by the shipped /ha-vuln per-host endpoint).
 *
 * ⚠️ FICTIONAL DATA — rendered ONLY in a DEV build with
 * `VITE_USE_FOUNDATION_FIXTURES=true` so the offline Posture tab's vuln card is
 * populated. Invented for visual review; NOT real findings and NEVER shipped in
 * production (prod alias throws). An empty or populated list here is not proof of a
 * host's real exposure.
 */

import type { VulnFindingDTO, VulnSeverity } from '@/types/vuln.types';

const NOW = '2026-10-21T22:14:00Z';

function mk(
  id: number,
  cveId: string,
  pkg: string,
  installed: string,
  fixed: string | null,
  cvss: number,
  severity: VulnSeverity,
  kev: boolean,
): VulnFindingDTO {
  return {
    id,
    agentId: 'agent-fixture-1',
    agentHostname: 'agent-fixture-1',
    cveId,
    purl: `pkg:deb/ubuntu/${pkg}@${installed}`,
    packageName: pkg,
    installedVersion: installed,
    fixedVersion: fixed,
    cvssV3: cvss,
    severity,
    kev,
    description: `[FIXTURE] ${cveId} affects ${pkg} ${installed}.`,
    references: [`https://nvd.nist.gov/vuln/detail/${cveId}`],
    publishedAt: '2026-08-01T00:00:00Z',
    firstSeenAt: '2026-10-01T00:00:00Z',
    lastSeenAt: NOW,
    epssScore: Math.round(cvss * 8) / 100,
    epssPercentile: Math.round(cvss * 9) / 100,
    epssAsOf: NOW,
    epssState: 'reported',
  };
}

const FINDINGS: VulnFindingDTO[] = [
  mk(5001, 'CVE-2026-1234', 'openssl', '3.0.2-0ubuntu1.10', '3.0.2-0ubuntu1.15', 9.8, 'CRITICAL', true),
  mk(5002, 'CVE-2026-5678', 'glibc', '2.35-0ubuntu3.1', '2.35-0ubuntu3.8', 8.1, 'HIGH', false),
  mk(5003, 'CVE-2026-9012', 'curl', '7.81.0-1ubuntu1.14', '7.81.0-1ubuntu1.16', 7.5, 'HIGH', true),
  mk(5004, 'CVE-2026-3456', 'libxml2', '2.9.13+dfsg-1', '2.9.13+dfsg-1ubuntu0.4', 6.5, 'MEDIUM', false),
  mk(5005, 'CVE-2026-7890', 'zlib', '1.2.11.dfsg-2ubuntu9.2', null, 3.7, 'LOW', false),
];

export function foundationVulnFindingsByAgent(
  _agentId: string,
  page = 0,
  size = 50,
): { findings: VulnFindingDTO[]; total: number } {
  const start = page * size;
  return { findings: FINDINGS.slice(start, start + size), total: FINDINGS.length };
}
