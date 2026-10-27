/**
 * SYNTHETIC design fixtures for the per-host CIS benchmark surface (PT-5).
 *
 * ⚠️ FICTIONAL DATA — rendered ONLY in a DEV build with
 * `VITE_USE_FOUNDATION_FIXTURES=true` so the offline per-host Posture tab shows a
 * populated CIS donut + control grid. Invented for visual review; NOT a real scan and
 * NEVER shipped in production (prod alias throws). A green pass rate here is fictional
 * and is not proof of any host's secure configuration.
 */

import type { CisScanResultDTO, CisScanSummaryDTO } from '@/types/cisScan.types';

const SCANNED_AT = '2026-10-21T22:14:00Z';

export function foundationCisSummary(agentId: string): CisScanSummaryDTO {
  return {
    scanned: true,
    scanId: `fixture-scan-${agentId}`,
    agentId,
    hostname: 'agent-fixture-1',
    profile: 'cis_level1_server',
    benchmark: 'CIS Ubuntu Linux 22.04 LTS Benchmark v1.0.0 [FIXTURE]',
    contentHash: 'sha256:fixture-deadbeef',
    mode: 'scheduled',
    total: 212,
    passCount: 171,
    failCount: 28,
    errorCount: 3,
    naCount: 8,
    notCheckedCount: 2,
    scorePct: 85.9,
    durationMs: 48230,
    scannedAt: SCANNED_AT,
  };
}

export function foundationCisResults(agentId: string, status?: string): CisScanResultDTO[] {
  const base: CisScanResultDTO[] = [
    mk(agentId, '1.1.1.1', 'Ensure cramfs kernel module is not available', 'PASS', 'medium'),
    mk(agentId, '1.4.1', 'Ensure bootloader password is set', 'FAIL', 'high'),
    mk(agentId, '2.2.1', 'Ensure X Window System is not installed', 'PASS', 'low'),
    mk(agentId, '3.3.1', 'Ensure source routed packets are not accepted', 'FAIL', 'high'),
    mk(agentId, '4.1.1.1', 'Ensure auditd is installed', 'PASS', 'high'),
    mk(agentId, '5.2.1', 'Ensure SSH access is limited', 'FAIL', 'critical'),
    mk(agentId, '5.3.4', 'Ensure password reuse is limited', 'PASS', 'medium'),
    mk(agentId, '6.1.2', 'Ensure permissions on /etc/passwd are configured', 'PASS', 'medium'),
    mk(agentId, '1.5.3', 'Ensure address space layout randomization is enabled', 'ERROR', 'medium'),
    mk(agentId, '2.1.1', 'Ensure time synchronization is in use', 'NOT_APPLICABLE', 'low'),
  ];
  if (status) return base.filter((r) => r.status === status);
  return base;
}

function mk(
  agentId: string,
  controlId: string,
  title: string,
  statusValue: CisScanResultDTO['status'],
  severity: string,
): CisScanResultDTO {
  return {
    scanId: `fixture-scan-${agentId}`,
    agentId,
    hostname: 'agent-fixture-1',
    profile: 'cis_level1_server',
    benchmark: 'CIS Ubuntu Linux 22.04 LTS Benchmark v1.0.0 [FIXTURE]',
    contentHash: 'sha256:fixture-deadbeef',
    mode: 'scheduled',
    controlId,
    title: `[FIXTURE] ${title}`,
    severity,
    status: statusValue,
    idref: `xccdf_org.cisecurity_rule_${controlId.replace(/\./g, '_')}`,
    remediation: statusValue === 'FAIL' ? '[FIXTURE] Apply the documented hardening step.' : null,
    scannedAt: SCANNED_AT,
  };
}
