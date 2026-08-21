export type IdentityKind = 'human' | 'service' | 'workload' | 'guest' | 'unknown';
export type IdentityRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type IdentityRiskTrend = 'rising' | 'stable' | 'declining' | 'new';
export type IdentityPrivilege = 'tier_0' | 'privileged' | 'standard' | 'unknown';
export type IdentityAuthStrength = 'phishing_resistant' | 'mfa' | 'single_factor' | 'unknown';
export type IdentityAccountState = 'active' | 'disabled' | 'locked' | 'unknown';
export type IdentityControlState = 'protected' | 'attention' | 'exposed' | 'unknown';
export type IdentityView = 'all' | 'high_risk' | 'privileged' | 'non_human' | 'control_gaps' | 'stale';
export type IdentitySort = 'risk_desc' | 'activity_desc' | 'alerts_desc' | 'name_asc';

export interface IdentityPostureItem {
  id: string;
  value: string;
  displayName: string;
  kind: IdentityKind;
  riskScore: number;
  riskLevel: IdentityRiskLevel;
  riskTrend: IdentityRiskTrend;
  privilege: IdentityPrivilege;
  authStrength: IdentityAuthStrength;
  accountState: IdentityAccountState;
  controlState: IdentityControlState;
  alertCount: number;
  lastSeen: string;
  firstSeen: string;
  tenantName: string | null;
  department: string | null;
  observationSources: string[];
  tags: string[];
  pivots: IdentityPivot[];
}

export interface IdentityPivot {
  type: 'dossier' | 'hunt' | 'alerts' | 'incidents';
  label: string;
  route: string;
}

export interface IdentityPostureSummary {
  total: number;
  highRisk: number;
  privileged: number | null;
  nonHuman: number | null;
  controlGaps: number | null;
  stale: number | null;
}

export interface IdentityPosturePage {
  items: IdentityPostureItem[];
  cursor: string | null;
  total: number;
  summary: IdentityPostureSummary;
  snapshotAt: string | null;
  contractState: 'complete' | 'partial';
  partialFailures: Array<{ source: string; message: string }>;
}

export interface IdentityPostureFilters {
  view: IdentityView;
  query?: string;
  kind?: IdentityKind | 'all';
  risk?: IdentityRiskLevel | 'all';
  auth?: IdentityAuthStrength | 'all';
  sort: IdentitySort;
  cursor?: string | null;
  limit: number;
}

export interface IdentityRiskSignal {
  id: string;
  label: string;
  description: string;
  severity: IdentityRiskLevel;
  contribution: number;
  evidenceCount: number;
  source: string;
  observedAt: string;
}

export interface IdentityAccessPath {
  id: string;
  label: string;
  type: 'role' | 'group' | 'resource' | 'path';
  criticality: 'critical' | 'high' | 'standard';
  inherited: boolean;
}

export interface IdentityActivityItem {
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  state: 'risk' | 'success' | 'info';
  source: string;
}

export interface IdentityPosturePreview extends IdentityPostureItem {
  email: string | null;
  manager: string | null;
  jobTitle: string | null;
  riskCalculatedAt: string | null;
  activeSessions: number | null;
  riskySignIns30d: number | null;
  credentialExposure: 'confirmed' | 'suspected' | 'none' | 'unknown';
  mfaRegistered: boolean | null;
  passwordlessCapable: boolean | null;
  conditionalAccess: 'enforced' | 'partial' | 'missing' | 'unknown';
  riskSignals: IdentityRiskSignal[];
  accessPaths: IdentityAccessPath[];
  activity: IdentityActivityItem[];
  intelligenceSummary: string | null;
  recommendedActions: string[];
  permissions: {
    hunt: boolean;
    openDossier: boolean;
    requestRemediation: boolean;
  };
  dataCompleteness: 'full' | 'partial';
}
