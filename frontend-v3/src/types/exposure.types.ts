export type ExposureRisk = 'critical' | 'high' | 'medium' | 'low';
export type ExposureView = 'attack_paths' | 'choke_points' | 'critical_assets' | 'remediation';
export type ExposureState = 'active' | 'accepted' | 'resolved';
export type ExposureTimeRange = '24h' | '7d' | '30d';
export type ExposureScope = 'all' | 'external' | 'hybrid' | 'internal';
export type ExposureEntityType = 'internet' | 'host' | 'identity' | 'ip' | 'service' | 'cloud' | 'application' | 'data';

export interface ExposureNodeDTO {
  id: string;
  name: string;
  type: ExposureEntityType;
  criticality: 'standard' | 'important' | 'critical';
  relationship?: string;
}

export interface ExposureEvidenceDTO {
  id: string;
  label: string;
  value: string;
  source: string;
  observedAt: string;
  confidence: number;
}

export interface AttackPathDTO {
  id: string;
  title: string;
  summary: string;
  riskLevel: ExposureRisk;
  riskScore: number;
  state: ExposureState;
  scope: Exclude<ExposureScope, 'all'>;
  entryPoint: ExposureNodeDTO;
  target: ExposureNodeDTO;
  pathNodes: ExposureNodeDTO[];
  hopCount: number;
  weakPointCount: number;
  criticalAssetCount: number;
  exploitability: 'verified' | 'probable' | 'unverified';
  techniques: string[];
  evidence: ExposureEvidenceDTO[];
  recommendedAction: string;
  owner: string | null;
  firstSeenAt: string;
  lastCalculatedAt: string;
}

export interface ChokePointDTO {
  id: string;
  name: string;
  entityType: ExposureEntityType;
  riskLevel: ExposureRisk;
  riskScore: number;
  pathCount: number;
  criticalAssetCount: number;
  reachableFromInternet: boolean;
  exposureDrivers: string[];
  affectedPathIds: string[];
  recommendedAction: string;
  lastCalculatedAt: string;
}

export interface CriticalAssetExposureDTO {
  id: string;
  name: string;
  entityType: ExposureEntityType;
  classification: string;
  riskLevel: ExposureRisk;
  riskScore: number;
  pathCount: number;
  shortestPathHops: number;
  internetReachable: boolean;
  topEntryPoint: string;
  owner: string | null;
  lastCalculatedAt: string;
}

export interface ExposureRemediationDTO {
  id: string;
  title: string;
  category: 'vulnerability' | 'identity' | 'configuration' | 'network' | 'control';
  riskLevel: ExposureRisk;
  exposureReduction: number;
  pathCount: number;
  criticalAssetCount: number;
  effort: 'low' | 'medium' | 'high';
  disruption: 'low' | 'medium' | 'high';
  state: 'proposed' | 'planned' | 'in_progress' | 'completed';
  owner: string | null;
  dueAt: string | null;
  recommendation: string;
  lastCalculatedAt: string;
}

export type ExposureRow = AttackPathDTO | ChokePointDTO | CriticalAssetExposureDTO | ExposureRemediationDTO;

export interface ExposureSummaryDTO {
  exposureScore: number | null;
  activeAttackPaths: number | null;
  criticalAssetsAtRisk: number | null;
  internetEntryPoints: number | null;
  chokePoints: number | null;
  reduciblePaths: number | null;
}

export interface ExposureFilters {
  view: ExposureView;
  query?: string;
  risk: ExposureRisk | 'all';
  scope: ExposureScope;
  state: ExposureState | 'all';
  timeRange: ExposureTimeRange;
  assetId?: string;
  cursor?: string | null;
  limit: number;
}

export interface ExposurePageDTO {
  items: ExposureRow[];
  nextCursor: string | null;
  total: number;
  summary: ExposureSummaryDTO;
  snapshotAt: string | null;
  freshness: 'fresh' | 'stale' | 'unknown';
  contractState: 'complete' | 'missing';
  partialFailures: Array<{ source: string; message: string }>;
}
