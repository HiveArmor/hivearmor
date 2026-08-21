/**
 * Posture Types — Assets & Identities
 */

// ===== ASSETS =====

export interface AssetDTO {
  id: number;
  clientName: string;
  clientDomain: string;
  clientPrefix: string;
  clientMail: string | null;
  clientLicenceExpire: string | null;
  clientLicenceVerified: boolean;
  connectionStatus?: 'ACTIVE' | 'INACTIVE' | 'UNREACHABLE' | 'UNKNOWN';
  lastSeen?: string | null;
  agentVersion?: string | null;
  platform?: 'windows' | 'linux' | 'macos' | 'other' | null;
  osVersion?: string | null;
  ipAddress?: string | null;
  canonicalEntityId?: string | null;
  category?: AssetCategory;
  deviceRole?: string | null;
  criticality?: AssetCriticality;
  riskLevel?: AssetRiskLevel;
  riskScore?: number | null;
  exposureLevel?: AssetExposureLevel;
  exposureScore?: number | null;
  sensorHealth?: AssetSensorHealth;
  onboardingStatus?: AssetOnboardingStatus;
  activeAlertCount?: number;
  vulnerabilityCount?: number;
  criticalVulnerabilityCount?: number;
  attackPathCount?: number;
  firstSeen?: string | null;
  macAddress?: string | null;
  owner?: string | null;
  ownerTeam?: string | null;
  discoverySources?: string[];
  tags?: string[];
  riskDrivers?: AssetRiskDriver[];
  recommendations?: AssetRecommendation[];
  coverage?: AssetCoverageSource[];
  cloudProvider?: 'AWS' | 'AZURE' | 'GCP' | null;
  cloudAccount?: string | null;
  snapshotVersion?: string | null;
}

export type AssetCategory = 'endpoint' | 'server' | 'cloud' | 'network' | 'iot_ot' | 'unknown';
export type AssetCriticality = 'mission_critical' | 'high' | 'medium' | 'low' | 'unassigned';
export type AssetRiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none' | 'unknown';
export type AssetExposureLevel = 'critical' | 'high' | 'medium' | 'low' | 'none' | 'unknown';
export type AssetSensorHealth = 'healthy' | 'degraded' | 'inactive' | 'unmanaged' | 'unknown';
export type AssetOnboardingStatus = 'onboarded' | 'discovered' | 'eligible' | 'unsupported' | 'unknown';

export interface AssetRiskDriver {
  id: string;
  label: string;
  kind: 'alert' | 'vulnerability' | 'exposure' | 'configuration' | 'identity';
  severity: Exclude<AssetRiskLevel, 'none' | 'unknown'>;
  evidenceCount: number;
  summary: string;
}

export interface AssetRecommendation {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  exposureReduction: number;
  ownerTeam: string | null;
  state: 'open' | 'planned' | 'in_progress' | 'resolved';
}

export interface AssetCoverageSource {
  id: string;
  name: string;
  state: 'healthy' | 'degraded' | 'stale' | 'missing';
  lastObserved: string | null;
}

export interface AssetFilters {
  q?: string;
  os?: string[];
  connectionStatus?: string[];
  licenceVerified?: boolean | null;
  from?: string;
  to?: string;
  category?: AssetCategory | 'all';
  riskLevel?: AssetRiskLevel | 'all';
  exposureLevel?: AssetExposureLevel | 'all';
  sensorHealth?: AssetSensorHealth | 'all';
  onboardingStatus?: AssetOnboardingStatus | 'all';
}

export interface AssetSummary {
  total: number;
  criticalAssets: number | null;
  highRisk: number;
  highExposure: number | null;
  notOnboarded: number;
  sensorAttention: number;
  newlyDiscovered: number;
}

export interface AssetListResponse {
  content: AssetDTO[];
  nextCursor?: string | null;
  hasMore?: boolean;
  totalElements: number;
  totalPages: number;
  number: number;
  summary?: AssetSummary;
  snapshotAt?: string;
  stale?: boolean;
  partialFailures?: Array<{ source: string; message: string }>;
}

export interface AssetDetailResponse {
  asset: AssetDTO;
  aliases: string[];
  riskDrivers: AssetRiskDriver[];
  recommendations: AssetRecommendation[];
  coverage: AssetCoverageSource[];
  redactionStates: Record<string, string>;
  provenance: Record<string, string>;
}

// ===== IDENTITIES =====

export interface IdentityDTO {
  id: string;
  entityType: 'user';
  entityValue: string;
  displayName: string | null;
  department: string | null;
  accountType: 'admin' | 'standard' | 'service' | 'unknown';
  riskScore: number;
  lastLogin: string | null;
  status: 'active' | 'disabled' | 'locked';
  adStatus: string | null;
  alertCount: number;
  linkedIncidentCount: number;
  lastSeen: string | null;
}

export interface IdentityRiskDetailDTO {
  id: string;
  riskScore: number;
  riskDrivers: RiskDriverDTO[];
  riskTrend: 'increasing' | 'decreasing' | 'stable';
  topAlertCategories: string[];
  lastCalculated: string;
}

export interface RiskDriverDTO {
  factor: string;
  contribution: number;
  description: string;
}

export interface IdentityFilters {
  q?: string;
  minRisk?: number;
  maxRisk?: number;
  department?: string;
  accountType?: string[];
  adStatus?: string;
}
