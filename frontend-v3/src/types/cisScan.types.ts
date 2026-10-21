/**
 * CIS benchmark scan types (PT-5, Option A) — mirrors the Java DTOs in
 * com.hivearmor.service.dto.cis. These back the per-host CIS posture surface
 * served from the net-new OpenSearch index (/api/ha-cis-scan), DISTINCT from the
 * legacy Postgres observed-SSH SCA types in vuln.types.ts.
 */

export type CisControlStatus = 'PASS' | 'FAIL' | 'ERROR' | 'NOT_APPLICABLE' | 'NOT_CHECKED';

export interface CisScanResultDTO {
  scanId: string | null;
  agentId: string | null;
  hostname: string | null;
  profile: string | null;
  benchmark: string | null;
  contentHash: string | null;
  mode: string | null;
  controlId: string | null;
  title: string | null;
  severity: string | null;
  status: CisControlStatus | string | null;
  idref: string | null;
  remediation: string | null;
  scannedAt: string | null;
}

export interface CisScanSummaryDTO {
  /** False when no CIS scan has been ingested for this host yet. */
  scanned: boolean;
  scanId: string | null;
  agentId: string | null;
  hostname: string | null;
  profile: string | null;
  benchmark: string | null;
  contentHash: string | null;
  mode: string | null;
  total: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  naCount: number;
  notCheckedCount: number;
  scorePct: number;
  durationMs: number;
  scannedAt: string | null;
}
