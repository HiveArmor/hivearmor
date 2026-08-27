import type { SeverityLevel } from '@/lib/severity';
import type { AlertSlaState } from '@/pages/alerts/alertTriage.types';

export type CorrelatedFindingStatus = 'open' | 'investigating' | 'incident_created' | 'resolved' | 'false_positive';
export type CorrelationKind = 'attack_chain' | 'shared_entity' | 'behavior_sequence' | 'campaign' | 'duplicate_cluster';
export type FindingOwnership = 'all' | 'mine' | 'unassigned';
export type FindingSort = 'risk_desc' | 'newest' | 'confidence_desc' | 'alerts_desc';
/** Inventory scopes for correlated findings (distinct from Queue shift views). */
export type FindingView = 'all' | 'open' | 'critical' | 'needs_review' | 'mine' | 'multi_stage' | 'sla_risk' | 'unassigned';

export interface FindingOwner {
  id: string;
  name: string;
}

export interface FindingEntity {
  id: string;
  type: 'host' | 'user' | 'ip' | 'domain' | 'process' | 'file' | 'cloud';
  label: string;
  role: 'source' | 'target' | 'pivot' | 'infrastructure';
  riskScore: number | null;
  criticality: 'critical' | 'high' | 'medium' | 'low' | null;
  alertCount: number;
}

export interface CorrelationReason {
  id: string;
  kind: 'shared_entity' | 'temporal_sequence' | 'threat_intel' | 'behavioral_pattern' | 'campaign_overlap';
  label: string;
  detail: string;
  strength: number;
  evidenceCount: number;
}

export interface FindingSignal {
  id: string;
  alertId: string;
  detectedAt: string;
  title: string;
  severity: SeverityLevel;
  category: string;
  ruleName: string;
  entityLabel: string;
  tactic: string | null;
  technique: string | null;
}

export interface FindingStage {
  id: string;
  order: number;
  detectedAt: string;
  tactic: string;
  technique: string | null;
  title: string;
  alertIds: string[];
}

export interface FindingRelationshipNode {
  id: string;
  label: string;
  type: FindingEntity['type'] | 'finding' | 'alert';
  severity: SeverityLevel | null;
  x: number;
  y: number;
}

export interface FindingRelationshipEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  confidence: number;
}

export interface FindingNarrative {
  summary: string;
  keyJudgments: string[];
  source: 'correlation_engine' | 'analyst' | 'ai_assisted';
  generatedAt: string;
  confidence: number;
}

export interface FindingAvailableAction {
  id: 'assign' | 'change_status' | 'promote_incident' | 'add_note';
  allowed: boolean;
  reason?: string;
}

export interface CorrelatedFindingDTO {
  id: string;
  title: string;
  summary: string;
  severity: SeverityLevel;
  riskScore: number | null;
  confidence: number;
  status: CorrelatedFindingStatus;
  correlationKind: CorrelationKind;
  firstSeen: string;
  lastSeen: string;
  alertCount: number;
  eventCount: number;
  dataSourceCount: number;
  intelMatchCount: number;
  relatedFindingCount: number;
  tenantName: string;
  owner: FindingOwner | null;
  slaStatus: AlertSlaState;
  mitreTactics: string[];
  mitreTechniques: string[];
  entities: FindingEntity[];
  correlationReasons: CorrelationReason[];
  stages: FindingStage[];
  signals: FindingSignal[];
  relationshipNodes: FindingRelationshipNode[];
  relationshipEdges: FindingRelationshipEdge[];
  narrative: FindingNarrative;
  availableActions: FindingAvailableAction[];
  correlationEngine: {
    version: string;
    ruleIds: string[];
    evaluatedAt: string;
  };
  incident: { id: string; title: string } | null;
  version: number;
  dataCompleteness: 'complete' | 'projection';
}

export interface CorrelatedFindingSummary {
  total: number;
  open: number;
  critical: number;
  unassigned: number;
  slaPressure: number;
  multiStage: number;
  newLast24h: number;
}

export interface CorrelatedFindingsFilter {
  from: string;
  to: string;
  view: FindingView;
  severity?: SeverityLevel;
  status?: CorrelatedFindingStatus;
  ownership?: FindingOwnership;
  search?: string;
  sort: FindingSort;
}

export interface CorrelatedFindingsResponse {
  summary: CorrelatedFindingSummary;
  items: CorrelatedFindingDTO[];
  total: number;
  nextCursor: string | null;
  snapshotAt: string;
  totalApproximate: boolean;
  dataCompleteness: 'complete' | 'projection';
}

export interface FindingPromotionPreview {
  findingId: string;
  proposedTitle: string;
  alertCount: number;
  entityCount: number;
  duplicateCandidates: Array<{ id: string; title: string; overlapPercent: number }>;
  warnings: string[];
  previewToken: string;
}
