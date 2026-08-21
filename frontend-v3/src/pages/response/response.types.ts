/**
 * Response Automation Type Definitions — Phase 7
 * Playbook library, builder, response activity, approvals, quarantine, and endpoint workflows.
 * DEF-04, DEF-05, DEF-06, DEF-07, RESP-001..RESP-012
 */

/**
 * Playbook lifecycle status
 */
export type PlaybookStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';

/**
 * Playbook execution result status
 */
export type PlaybookRunStatus = 'success' | 'failure' | 'running' | 'cancelled' | 'awaiting_approval';

/**
 * Trigger type enumeration
 */
export type TriggerType = 'MANUAL' | 'AUTOMATIC' | 'SCHEDULED';

/**
 * Node type enumeration
 */
export type NodeType = 'TRIGGER' | 'ACTION' | 'CONDITION' | 'LOOP' | 'END';

/**
 * Action category enumeration
 */
export type ActionCategory = 'NOTIFICATION' | 'ISOLATION' | 'ENRICHMENT' | 'INVESTIGATION' | 'REMEDIATION';

/**
 * Action parameter type enumeration
 */
export type ActionParameterType = 'STRING' | 'INTEGER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT';

/**
 * Playbook DTO (list and detail)
 */
export interface PlaybookDTO {
  id?: string;
  name: string;
  description?: string;
  status: PlaybookStatus;
  triggerType: TriggerType;
  executionCount?: number;
  lastExecutedAt?: string;
  nodes: PlaybookNodeDTO[];
  edges: PlaybookEdgeDTO[];
}

/**
 * Playbook node DTO
 */
export interface PlaybookNodeDTO {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/**
 * Playbook edge DTO
 */
export interface PlaybookEdgeDTO {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/**
 * Action definition DTO (catalogue from backend)
 */
export interface ActionDefinitionDTO {
  id: string;
  name: string;
  category: ActionCategory;
  description: string;
  parameters: ActionParameterDTO[];
}

/**
 * Action parameter definition DTO
 */
export interface ActionParameterDTO {
  key: string;
  label: string;
  type: ActionParameterType;
  required: boolean;
  options?: string[];
}

/**
 * Playbook list filter parameters
 */
export interface PlaybookListParams {
  page?: number;
  size?: number;
  status?: PlaybookStatus | 'ALL';
  triggerType?: TriggerType | 'ALL';
}

/**
 * Validation error detail
 */
export interface ValidationError {
  nodeId?: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Authority (Role) DTO — DEF-06
 */
export interface AuthorityDTO {
  id?: string;
  name: string;
  displayLabel: string;
  permissions: string[];
}

/**
 * Response Activity status enumeration — DEF-07
 */
export type ResponseActivityStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'AWAITING_APPROVAL'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED'
  | 'BLOCKED';

/**
 * Response Activity entry DTO — DEF-07
 */
export interface ResponseActivityDTO {
  id: string;
  timestamp: string;
  playbookName: string;
  playbookId: string;
  trigger: TriggerType;
  linkedEntityId?: string;
  linkedEntityType?: 'ALERT' | 'INCIDENT';
  executedBy: string;
  status: ResponseActivityStatus;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  playbookVersion?: number;
  tenantLabel?: string;
  currentStep?: string;
  progressPercent?: number;
  correlationId?: string;
  auditId?: string;
  approvalReference?: string;
  connectorState?: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  retryCount?: number;
  warningCount?: number;
  /** Bounded list projection count. Full node detail is loaded from the trace resource. */
  stepCount?: number;
  capabilities?: {
    canCancel?: boolean;
    canRetry?: boolean;
    canViewInputs?: boolean;
    canViewOutputs?: boolean;
  };
  steps: ActivityStepDTO[];
  rawLog?: string;
}

/**
 * Activity step DTO — DEF-07
 */
export interface ActivityStepDTO {
  id: string;
  actionName: string;
  nodeType?: 'trigger' | 'action' | 'condition' | 'approval' | 'delay' | 'loop' | 'parallel' | 'subplaybook' | 'transform' | 'intelligence' | 'end';
  status: 'queued' | 'running' | 'waiting' | 'success' | 'error' | 'skipped' | 'cancelled';
  resultSummary?: string;
  errorMessage?: string;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  retryCount?: number;
  inputSummary?: string;
  outputSummary?: string;
  redactedFields?: string[];
}

/**
 * Response Activity list filter parameters — DEF-07
 */
export interface ResponseActivityListParams {
  page?: number;
  size?: number;
  cursor?: string;
  timeFrom?: string;
  timeTo?: string;
  status?: ResponseActivityStatus | 'ALL';
  triggeredBy?: string;
  actionType?: string;
  trigger?: TriggerType | 'ALL';
  playbookId?: string;
  tenantScope?: string;
}

export interface ResponseActivitySummary {
  total: number;
  running: number;
  awaitingApproval: number;
  failed: number;
  partial: number;
  successRate: number;
  medianDurationMs: number;
  degradedConnectors: number;
  snapshotAt: string;
  totalIsExact: boolean;
  partialFailures: string[];
}

export interface ResponseActivityPageResult extends CursorPageResult<ResponseActivityDTO> {
  summary: ResponseActivitySummary;
  previousCursor?: string | null;
  snapshotAt: string;
  stale: boolean;
}

export interface ResponseExecutionTraceResult extends CursorPageResult<ActivityStepDTO> {
  snapshotAt: string;
  stale: boolean;
  partialFailures: string[];
}

// ─── Phase 7 extended types ────────────────────────────────────────────────

/**
 * Generic cursor-paged result envelope used for all high-volume lists (RESP-001, RESP-007).
 */
export interface CursorPageResult<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
  /** True when the caller should append to existing items (infinite scroll / "load more"). */
  hasMore: boolean;
}

/**
 * Compact row projection used in the playbook library grid — RESP-001.
 * Keeps only the fields needed for the AG Grid row; full detail loaded on demand.
 */
export interface PlaybookListItem {
  id: string;
  name: string;
  description: string;
  status: PlaybookStatus;
  triggerType: TriggerType;
  category: PlaybookCategory;
  /** Number of successful executions lifetime */
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: PlaybookRunStatus | null;
  approvalRequired: boolean;
  createdBy: string;
  updatedAt: string;
}

/**
 * High-level playbook category used for library filtering.
 */
export type PlaybookCategory =
  | 'EDR'
  | 'Identity'
  | 'Network'
  | 'Cloud'
  | 'Ticketing'
  | 'Notification'
  | 'Enrichment'
  | 'Multi-step';

/**
 * Blast radius descriptor shown in preview / approve / execute flows.
 * Communicates scope, reversibility, and risk before a disruptive action proceeds.
 */
export interface BlastRadiusDescriptor {
  /** Human-readable list of what will be affected (hosts, accounts, rules). */
  affectedTargets: string[];
  /** HIGH: irreversible without manual effort. MEDIUM: reversible with a tooled rollback. LOW: non-destructive. */
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  /** True if the action can be undone by the rollback procedure below. */
  reversible: boolean;
  /** Plain-text description of how to roll back the action. Required when reversible=true. */
  rollbackGuidance: string | null;
  /** Required permission level beyond the triggering user's base role. */
  requiredPermission: string;
  /** MITRE ATT&CK technique the action counters, for SOC decision context. */
  mitreReference: string | null;
}

/**
 * Approval workflow status for a pending playbook execution.
 */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'AUTO_APPROVED';

/**
 * An approval request record attached to a playbook execution.
 */
export interface ApprovalRecord {
  approvalId: string;
  executionId: string;
  playbookId: string;
  playbookName: string;
  requestedBy: string;
  requestedAt: string;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string;
  blastRadius: BlastRadiusDescriptor;
}

/** Complete lifecycle used by the response-governance queue. */
export type ResponseApprovalState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

/** Risk-weighted approval request projection. Raw event payloads and secrets are excluded. */
export interface ResponseApprovalRequest {
  id: string;
  executionId: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: number;
  actionName: string;
  actionCategory: 'ENDPOINT' | 'IDENTITY' | 'NETWORK' | 'CLOUD' | 'CASE';
  state: ResponseApprovalState;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  requestedBy: string;
  requesterRole: string;
  requestedAt: string;
  expiresAt: string;
  tenantId: string;
  tenantLabel: string;
  linkedEntityType: 'ALERT' | 'INCIDENT' | 'MANUAL';
  linkedEntityId: string | null;
  targetType: string;
  targets: string[];
  affectedUserCount: number;
  estimatedDowntime: string;
  reversible: boolean;
  rollbackGuidance: string | null;
  requiredPermission: string;
  approvalPolicy: string;
  approvalTier: number;
  approvalsRequired: number;
  approvalsReceived: number;
  eligibleApproverGroups: string[];
  connectorName: string;
  connectorState: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  confidence: number;
  evidenceSummary: string;
  changeWindowState: 'OPEN' | 'RESTRICTED' | 'EMERGENCY_ONLY';
  separationOfDutiesSatisfied: boolean;
  decisionBy: string | null;
  decisionAt: string | null;
  decisionComment: string | null;
  auditId: string;
  correlationId: string;
}

export interface ResponseGovernanceSummary {
  pending: number;
  dueSoon: number;
  critical: number;
  restrictedWindow: number;
  approved24h: number;
  rejected24h: number;
  medianDecisionMs: number;
  connectorWarnings: number;
  snapshotAt: string;
}

export interface ResponseAuthorityPolicy {
  id: string;
  version: number;
  name: string;
  actionCategory: ResponseApprovalRequest['actionCategory'];
  riskFloor: ResponseApprovalRequest['riskLevel'];
  tenantScope: string;
  requiredApprovals: number;
  approverGroups: string[];
  selfApprovalAllowed: boolean;
  changeWindow: string;
  rollbackRequired: boolean;
  status: 'ENFORCED' | 'MONITOR' | 'DISABLED';
  lastChangedAt: string;
  lastChangedBy: string;
}

export interface ResponseAuthorityDelegate {
  id: string;
  version: number;
  principal: string;
  principalType: 'USER' | 'GROUP';
  authorityTier: number;
  actionScopes: string[];
  tenantScope: string;
  validFrom: string;
  validUntil: string;
  emergencyAccess: boolean;
  status: 'ACTIVE' | 'EXPIRING' | 'INACTIVE';
}

export interface ResponseGovernanceResult {
  approvals: ResponseApprovalRequest[];
  policies: ResponseAuthorityPolicy[];
  delegates: ResponseAuthorityDelegate[];
  summary: ResponseGovernanceSummary;
  snapshotAt: string;
  stale: boolean;
  partialFailures: string[];
}

export interface ResponseApprovalListParams {
  state?: ResponseApprovalState | 'ALL';
  risk?: ResponseApprovalRequest['riskLevel'] | 'ALL';
  tenantScope?: string;
  search?: string;
  limit?: number;
}

export interface ResponseApprovalDecisionRequest {
  approvalId: string;
  decision: 'APPROVED' | 'REJECTED';
  comment: string;
  expectedState: 'PENDING';
  acknowledgement: boolean;
}

export interface ResponseAuthorityPolicySaveRequest {
  id?: string;
  expectedVersion?: number;
  name: string;
  actionCategory: ResponseApprovalRequest['actionCategory'];
  riskFloor: ResponseApprovalRequest['riskLevel'];
  tenantScope: string;
  requiredApprovals: number;
  approverGroups: string[];
  selfApprovalAllowed: boolean;
  changeWindow: string;
  rollbackRequired: boolean;
  status: ResponseAuthorityPolicy['status'];
  changeReason: string;
  publish: boolean;
}

export interface ResponseAuthorityDelegateSaveRequest {
  id?: string;
  expectedVersion?: number;
  principal: string;
  principalType: ResponseAuthorityDelegate['principalType'];
  authorityTier: number;
  actionScopes: string[];
  tenantScope: string;
  validFrom: string;
  validUntil: string;
  emergencyAccess: boolean;
  status: ResponseAuthorityDelegate['status'];
  changeReason: string;
  publish: boolean;
}

/**
 * Request to preview playbook execution before committing — RESP-002.
 * Backend returns a dry-run summary with blast radius details.
 */
export interface PlaybookPreviewRequest {
  playbookId: string;
  /** Context entity that triggered this execution (alert id, incident id, manual). */
  triggerContext: {
    entityType: 'ALERT' | 'INCIDENT' | 'MANUAL';
    entityId: string | null;
  };
  /** Input variables to pass to the playbook run. */
  inputs: Record<string, string | number | boolean>;
}

/**
 * Preview response returned before a confirm-execute call — RESP-002.
 */
export interface PlaybookPreviewResponse {
  previewToken: string;
  playbookId: string;
  estimatedDurationSeconds: number;
  stepCount: number;
  blastRadius: BlastRadiusDescriptor;
  approvalRequired: boolean;
  validationResult: ValidationResult;
  stepSummaries: Array<{
    stepOrder: number;
    actionName: string;
    targetDescription: string;
    estimatedDurationMs: number;
  }>;
}

/**
 * Execution request payload — RESP-003. Must include the previewToken from RESP-002.
 */
export interface PlaybookExecuteRequest {
  /** Token from preview response — confirms caller reviewed blast radius. */
  previewToken: string;
  playbookId: string;
  triggerContext: {
    entityType: 'ALERT' | 'INCIDENT' | 'MANUAL';
    entityId: string | null;
  };
  inputs: Record<string, string | number | boolean>;
}

/**
 * Execute response — RESP-003. executionId is used to open the SSE stream.
 */
export interface PlaybookExecuteResponse {
  executionId: string;
  playbookId: string;
  status: 'RUNNING' | 'QUEUED_FOR_APPROVAL';
  approvalId: string | null;
  streamUrl: string;
}

// ─── SSE streaming event types ────────────────────────────────────────────

export type PlaybookStreamEventType =
  | 'EXECUTION_STARTED'
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'STEP_SKIPPED'
  | 'EXECUTION_COMPLETED'
  | 'EXECUTION_FAILED'
  | 'EXECUTION_CANCELLED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_RECEIVED';

export type StreamStepStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface PlaybookStreamEvent {
  eventType: PlaybookStreamEventType;
  executionId: string;
  timestamp: string;
  /** Present for STEP_* events */
  step?: {
    stepOrder: number;
    actionName: string;
    status: StreamStepStatus;
    durationMs?: number;
    resultSummary?: string;
    errorMessage?: string;
    outputFields?: Record<string, string>;
  };
  /** Present for EXECUTION_COMPLETED / EXECUTION_FAILED */
  summary?: {
    status: PlaybookRunStatus;
    totalDurationMs: number;
    stepsCompleted: number;
    stepsFailed: number;
    stepsSkipped: number;
  };
  /** Present for APPROVAL_REQUIRED */
  approvalRequest?: {
    approvalId: string;
    requiredBy: string;
    expiresAt: string;
  };
}

// ─── Quarantine ────────────────────────────────────────────────────────────

export type QuarantineStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED' | 'FAILED';

export type QuarantineTargetType = 'HOST' | 'ACCOUNT' | 'NETWORK_SEGMENT' | 'PROCESS';

/**
 * A quarantine record created by an isolation action — RESP-008.
 */
export interface QuarantineRecord {
  quarantineId: string;
  targetType: QuarantineTargetType;
  targetId: string;
  targetDisplayName: string;
  status: QuarantineStatus;
  initiatedBy: string;
  initiatedAt: string;
  expiresAt: string | null;
  releasedBy: string | null;
  releasedAt: string | null;
  linkedExecutionId: string;
  linkedAlertId: string | null;
  blastRadius: BlastRadiusDescriptor;
  notes: string | null;
}

// ─── Endpoint workflows ────────────────────────────────────────────────────

export type EndpointActionType =
  | 'ISOLATE_HOST'
  | 'RELEASE_HOST'
  | 'KILL_PROCESS'
  | 'COLLECT_ARTIFACT'
  | 'RUN_SCRIPT'
  | 'PATCH_APPLY'
  | 'ROLLBACK_CHANGE';

/**
 * Request to execute an endpoint workflow action — RESP-009.
 */
export interface EndpointWorkflowRequest {
  actionType: EndpointActionType;
  targetHostId: string;
  /** Justification text stored in audit log. */
  justification: string;
  /** Parameters specific to the action type. */
  parameters: Record<string, string | number | boolean>;
  /** previewToken from a prior RESP-002 preview call; required for destructive actions. */
  previewToken?: string;
}

/**
 * Result of an endpoint workflow execution — RESP-009.
 */
export interface EndpointWorkflowResult {
  workflowId: string;
  actionType: EndpointActionType;
  targetHostId: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'AWAITING_APPROVAL';
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  resultDetail: string | null;
}

// ─── Action catalog ────────────────────────────────────────────────────────

/**
 * Action catalog entry returned by GET /api/ha-action-catalog — RESP-011.
 * Describes an available action primitive that can be added to a playbook step.
 */
export interface ActionCatalogEntry {
  actionId: string;
  name: string;
  description: string;
  category: ActionCategory;
  integrationName: string;
  integrationLogoUrl: string | null;
  parameters: ActionParameterDTO[];
  blastRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresApproval: boolean;
  rollbackSupported: boolean;
  docsUrl: string | null;
}

/**
 * Action catalog category summary — RESP-011.
 */
export interface ActionCatalogSummary {
  categories: Array<{
    category: ActionCategory;
    actionCount: number;
    integrationCount: number;
  }>;
  totalActions: number;
  lastUpdatedAt: string;
}

// ─── Metrics strip ─────────────────────────────────────────────────────────

/**
 * Playbook library summary metrics shown in the workload strip — RESP-001.
 */
export interface PlaybookMetricsSummary {
  total: number;
  active: number;
  executionsLast24h: number;
  successRate24h: number;
  pendingApprovals: number;
  activeQuarantines: number;
  snapshotAt: string;
}
