export type InvestigationStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED' | 'CONVERTED';
export type InvestigationPhase = 'prepare' | 'execute' | 'assess' | 'act' | 'knowledge';
export type InvestigationItemType = 'LOG_EVENT' | 'ALERT' | 'ENTITY' | 'FINDING' | 'NOTE';
export type InvestigationTaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type HypothesisOutcome = 'open' | 'supported' | 'refuted' | 'inconclusive';

export interface InvestigationSession {
  id: number;
  version?: number;
  tenantId?: number | null;
  sessionName: string;
  description: string | null;
  status: InvestigationStatus;
  createdBy: string;
  assignedTo: string | null;
  incidentId: number | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  phase?: InvestigationPhase;
  hypothesisCount?: number;
  openHypothesisCount?: number;
  alertCount?: number;
  entityCount?: number;
  eventCount?: number;
  taskCompleted?: number;
  taskTotal?: number;
  confidence?: number;
  freshness?: 'current' | 'stale' | 'partial';
  permissions?: {
    edit: boolean;
    pin: boolean;
    convert: boolean;
    delete: boolean;
  };
}

export interface InvestigationSessionItem {
  id: number;
  sessionId: number;
  itemType: InvestigationItemType;
  itemRef: string;
  itemSnapshot: string | null;
  note: string | null;
  addedBy: string;
  addedAt: string;
}

export interface InvestigationSessionTask {
  id: number;
  sessionId: number;
  title: string;
  status: InvestigationTaskStatus;
  assignee: string | null;
  externalTicketUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationHypothesis {
  id: string;
  statement: string;
  outcome: HypothesisOutcome;
  confidence: number;
  technique: string;
  confirmingEvidence: string[];
  denyingEvidence: string[];
  owner: string;
  updatedAt: string;
}

export interface InvestigationActivity {
  id: string;
  kind: 'note' | 'query' | 'evidence' | 'status' | 'automation';
  actor: string;
  summary: string;
  occurredAt: string;
}

export interface InvestigationDetail extends InvestigationSession {
  hypothesis: string | null;
  objective: string | null;
  timeRange: { from: string; to: string } | null;
  dataSources: string[];
  techniques: string[];
  hypotheses: InvestigationHypothesis[];
  activity: InvestigationActivity[];
  nextActions: string[];
  conclusion: string | null;
  artifactsProduced: Array<{ type: 'detection' | 'coverage_gap' | 'negative_result'; label: string; status: 'draft' | 'ready' | 'published' }>;
}

export interface InvestigationPageResult {
  items: InvestigationSession[];
  total: number;
  page: number;
  size: number;
  snapshotAt: string;
  filtering: 'authoritative' | 'loaded_projection';
}

export interface InvestigationListParams {
  page: number;
  size: number;
  search?: string;
  status?: InvestigationStatus | 'ALL';
  ownership?: 'mine' | 'all';
}

export interface CreateInvestigationInput {
  sessionName: string;
  description: string;
  assignedTo?: string;
}

export interface UpdateInvestigationInput {
  version?: number;
  sessionName?: string;
  description?: string;
  status?: InvestigationStatus;
  assignedTo?: string;
}

export interface PinInvestigationItemInput {
  itemType: InvestigationItemType;
  itemRef: string;
  itemSnapshot?: string;
  note?: string;
}

export interface CreateInvestigationTaskInput {
  title: string;
  status?: InvestigationTaskStatus;
  assignee?: string | null;
  externalTicketUrl?: string | null;
}

export interface UpdateInvestigationTaskInput {
  title?: string;
  status?: InvestigationTaskStatus;
  assignee?: string | null;
  externalTicketUrl?: string | null;
}

/** INV-012 promotion preview projection. */
export interface InvestigationPromotionPreview {
  sessionId: number;
  sessionVersion: number;
  incidentSummary: {
    title: string;
    descriptionExcerpt: string;
    recommendedSeverity: number;
    recommendedPriority: string;
    severityReasons: string[];
    assignee: string | null;
    targetTenantId: number | null;
  };
  eligibleEvidence: {
    totalArtifacts: number;
    alertCount: number;
    entityCount: number;
    eventCount: number;
    otherCount: number;
  };
  duplicateOrSimilarIncidents: unknown[];
  policyGates: string[];
  missingPrerequisites: string[];
  warnings: string[];
  blastRadius: {
    createsIncident: boolean;
    marksSessionConverted: boolean;
    linksSessionIncidentId: boolean;
    doesNotAutoLinkOpenSearchAlertsYet: boolean;
  };
  previewToken: string;
  expiresInSeconds: number;
}

export interface InvestigationPromotionResult {
  incidentId: number;
  sessionId: number;
  status: string;
  reason?: string;
  idempotencyKey?: string | null;
  auditReference?: string;
}
