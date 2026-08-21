/**
 * Vulnerability management types — HiveArmor frontend.
 * Mirrors the Java DTOs in com.hivearmor.service.dto.vuln
 */

export type VulnSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface VulnFindingDTO {
  id: number;
  agentId: string;
  agentHostname: string | null;
  cveId: string;
  purl: string | null;
  packageName: string;
  installedVersion: string | null;
  fixedVersion: string | null;
  cvssV3: number | null;
  severity: VulnSeverity;
  kev: boolean;          // maps to Java isKev()
  description: string | null;
  references: string[] | null;
  publishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  epssScore?: number | null;
  epssPercentile?: number | null;
  epssAsOf?: string | null;
  epssState?: 'unavailable' | 'reported' | string;
}

export interface TopCveDTO {
  cveId: string;
  cvssV3: number;
  severity: VulnSeverity;
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
  snapshotAt?: string | null;
  topCves: TopCveDTO[];
}

export interface VulnFindingsQuery {
  agentId?: string;
  severity?: VulnSeverity;
  isKev?: boolean;
  cve?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
  cursor?: string;
}

export interface VulnRemediationDTO {
  state: 'unavailable' | string;
  reason: string;
}

/** SCA / CIS Benchmark types */

export type ScaStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'ERROR';
export type CisLevel = 'L1' | 'L2';

export interface ScaResultDTO {
  id: number;
  agentId: string;
  agentHostname: string | null;
  checkId: string;
  checkTitle: string;
  packId: string | null;
  level: CisLevel | null;
  status: ScaStatus;
  observedValue: string | null;
  expectedValue: string | null;
  remediation: string | null;
  mitre: string[];
  complianceTags: string[];
  scannedAt: string;
}

export interface ScaSummaryDTO {
  id: number;
  agentId: string;
  agentHostname: string | null;
  packId: string;
  total: number;
  passCount: number;
  failCount: number;
  naCount: number;
  errorCount: number;
  scorePct: number;
  scannedAt: string;
}

export interface ScaResultsQuery {
  agentId?: string;
  checkId?: string;
  status?: ScaStatus;
  level?: CisLevel;
  page?: number;
  size?: number;
  cursor?: string;
}

export interface CisPackCatalogDTO {
  packId: string;
  packVersion?: string;
  authority?: string;
  licenseState?: string;
  officialBenchmark?: boolean;
  platform?: string;
  title?: string;
  note?: string;
  reportingAgents: number;
  lastScannedAt: string | null;
  source: string;
}

export interface VulnRemediationConnectorDTO {
  id: string;
  name: string;
  kind: string;
  state: string;
  note: string;
}
