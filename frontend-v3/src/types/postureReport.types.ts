/**
 * Cross-fleet posture reporting types (SPEC-PT-6) — mirror the Java DTOs in
 * com.hivearmor.service.dto.posture. These back the fleet-wide posture/trend/report
 * surface served from /api/ha-posture-report, aggregated over the PT-5 per-host CIS
 * (v3-hive-cis-*) and vuln (ha_vuln_finding) stores. Honesty: a null fleetScorePct or
 * a scanned=false host means "not covered", never a fabricated 100%.
 */

export interface HostCisPosture {
  agentId: string | null;
  hostname: string | null;
  platform: string | null;
  /** False when the host has no ingested CIS scan — honest "not covered". */
  scanned: boolean;
  total: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  naCount: number;
  notCheckedCount: number;
  /** Null when not scanned or no decidable controls. */
  scorePct: number | null;
  profile: string | null;
  benchmark: string | null;
  scannedAt: string | null;
}

export interface FleetCisPostureDTO {
  fleetHostCount: number;
  hostsScanned: number;
  hostsNotScanned: number;
  total: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  naCount: number;
  notCheckedCount: number;
  /** Null when no host has been scanned — the UI renders "not covered", not a number. */
  fleetScorePct: number | null;
  lastScannedAt: string | null;
  hosts: HostCisPosture[];
}

export interface TopCveDTO {
  cveId: string | null;
  cvssV3: number;
  severity: string | null;
  kev: boolean;
  affectedAgents: number;
}

export interface VulnSummaryDTO {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  kevCount: number;
  affectedAgents: number;
  snapshotAt: string | null;
  topCves: TopCveDTO[] | null;
}

export interface PostureCoverage {
  fleetHostCount: number;
  hostsWithCis: number;
  hostsWithVuln: number;
  /** Hosts with neither CIS nor vuln data — zero visibility. */
  hostsUncovered: number;
}

export interface FleetPostureOverviewDTO {
  snapshotAt: string | null;
  cis: FleetCisPostureDTO;
  vuln: VulnSummaryDTO;
  coverage: PostureCoverage;
}

export interface PostureTrendPoint {
  /** Bucket start, ISO-8601 date (yyyy-MM-dd). */
  bucket: string;
  passCount: number;
  failCount: number;
  errorCount: number;
  /** Null when the bucket has no decidable controls. */
  scorePct: number | null;
  hostsScanned: number;
}

export interface PostureTrendDTO {
  interval: string;
  cisScore: PostureTrendPoint[];
  /** True only when at least two distinct scan points exist to compute drift. */
  driftAvailable: boolean;
  cisScoreDrift: number | null;
  failCountDrift: number | null;
}
