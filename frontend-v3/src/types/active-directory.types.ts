export type AdRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type AdHealthState = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type AdAssessmentState = 'open' | 'planned' | 'accepted' | 'resolved';
export type AdAssessmentCategory = 'identity_infrastructure' | 'accounts' | 'group_policy' | 'certificates' | 'hybrid_security' | 'trusts';
export type AdView = 'assessments' | 'domains' | 'changes' | 'infrastructure';
export type AdTimeRange = '24h' | '7d' | '30d';

export interface AdDomainControllerDTO {
  id: string;
  hostname: string;
  ipAddress: string;
  site: string;
  operatingSystem: string;
  roles: string[];
  health: AdHealthState;
  sensorState: AdHealthState;
  replicationLagSeconds: number | null;
  lastObservedAt: string | null;
}

export interface AdTrustDTO {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  type: 'parent_child' | 'tree_root' | 'external' | 'forest' | 'shortcut';
  direction: 'inbound' | 'outbound' | 'bidirectional';
  transitive: boolean;
  selectiveAuthentication: boolean | null;
  sidFiltering: boolean | null;
  riskLevel: AdRiskLevel;
  riskReason: string;
}

export interface AdDomainSummaryDTO {
  id: string;
  domainName: string;
  forestName: string;
  netbiosName: string;
  functionalLevel: string;
  health: AdHealthState;
  postureScore: number;
  domainControllerCount: number;
  monitoredControllerCount: number;
  replicationLagSeconds: number | null;
  trustCount: number;
  tierZeroPathCount: number;
  criticalAssessmentCount: number;
  lastObservedAt: string | null;
  domainControllers: AdDomainControllerDTO[];
  trusts: AdTrustDTO[];
}

export interface AdAssessmentDTO {
  id: string;
  title: string;
  summary: string;
  category: AdAssessmentCategory;
  riskLevel: AdRiskLevel;
  state: AdAssessmentState;
  domainId: string;
  domainName: string;
  exposedEntityCount: number;
  scoreImpact: number;
  attackTechniques: string[];
  evidence: AdEvidenceDTO[];
  affectedEntities: AdAffectedEntityDTO[];
  recommendation: string;
  owner: string | null;
  dueAt: string | null;
  firstDetectedAt: string;
  lastEvaluatedAt: string;
}

export interface AdEvidenceDTO {
  id: string;
  label: string;
  value: string;
  source: string;
  observedAt: string;
}

export interface AdAffectedEntityDTO {
  id: string;
  name: string;
  type: 'user' | 'group' | 'computer' | 'policy' | 'certificate' | 'domain';
  criticality: 'tier_0' | 'sensitive' | 'standard';
  path?: string;
}

export interface AdTrackerEventDTO {
  id: string;
  occurredAt: string;
  ingestedAt: string;
  domainId: string;
  domainName: string;
  actor: string;
  actorType: 'user' | 'service' | 'computer' | 'unknown';
  action: string;
  target: string;
  targetType: 'user' | 'group' | 'computer' | 'policy' | 'certificate' | 'domain';
  riskLevel: AdRiskLevel;
  authorized: boolean | null;
  source: string;
  evidenceCount: number;
  description: string;
}

export interface AdInfrastructureDTO {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
  role: 'domain_controller' | 'ad_cs' | 'ad_fs' | 'entra_connect' | 'dns' | 'sensor';
  health: AdHealthState;
  monitoringState: 'monitored' | 'partial' | 'unmonitored' | 'unknown';
  version: string | null;
  issueCount: number;
  lastObservedAt: string | null;
}

export type AdRow = AdAssessmentDTO | AdDomainSummaryDTO | AdTrackerEventDTO | AdInfrastructureDTO;

export interface AdPostureSummary {
  postureScore: number | null;
  criticalAssessments: number | null;
  tierZeroPaths: number | null;
  riskyChanges24h: number | null;
  unhealthySensors: number | null;
  replicationIssues: number | null;
}

export interface AdPostureFilters {
  view: AdView;
  query?: string;
  domain?: string;
  risk?: AdRiskLevel | 'all';
  category?: AdAssessmentCategory | 'all';
  timeRange: AdTimeRange;
  cursor?: string | null;
  limit: number;
}

export interface AdPosturePage {
  items: AdRow[];
  cursor: string | null;
  total: number;
  domains: Array<{ value: string; label: string }>;
  summary: AdPostureSummary;
  snapshotAt: string | null;
  contractState: 'complete' | 'missing';
  partialFailures: Array<{ source: string; message: string }>;
}

export interface AdReportSummaryDTO {
  reportType: string;
  period: string;
  eventCount: number;
  riskScore: number;
  topAffectedUsers: string[];
  generatedAt: string;
}

export interface AdTrackerParams {
  objectType?: string;
  changeType?: string;
  domain?: string;
  page?: number;
  size?: number;
}
