/**
 * Incident Workbench — Type Definitions
 * Types for the Sprint 43 workbench contracts INC-001 through INC-008
 */

// ─── INC-001: Metadata Edit with Optimistic Concurrency ─────────────────────

export interface IncidentPatch {
  title?: string;
  description?: string;
  assignee?: string;
  assigneeGroup?: string;
  status?: string;
  severity?: string;
  tags?: string[];
  category?: string;
  classification?: string;
  customFields?: Record<string, unknown>;
}

export interface ConflictField {
  yours: string | null;
  theirs: string | null;
  base: string | null;
}

export interface ConflictResponse {
  conflict: true;
  serverVersion: number;
  fields: Record<string, ConflictField>;
}

export interface PatchedIncident {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: string;
  assignee: string | null;
  assigneeGroup: string | null;
  tags: string[];
  category: string | null;
  classification: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  customFields: Record<string, unknown>;
}

// ─── INC-002: Task Management ────────────────────────────────────────────────

export interface TaskChecklist {
  id: string;
  label: string;
  checked: boolean;
}

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'blocked';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface IncidentTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  version: number;
  checklist: TaskChecklist[];
}

export interface CreateTaskBody {
  title: string;
  description?: string;
  assignee?: string;
  priority?: TaskPriority;
  dueAt?: string;
  checklist?: Array<{ label: string }>;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string;
  priority?: TaskPriority;
  dueAt?: string;
  checklist?: Array<{ id?: string; label?: string; checked?: boolean }>;
}

export interface TaskListResponse {
  items: IncidentTask[];
  cursor: string | null;
  total: number;
}

// ─── INC-003: Similar Incidents ──────────────────────────────────────────────

export type SimilarityReasonType =
  | 'shared_entity'
  | 'same_rule'
  | 'shared_indicator'
  | 'semantic_summary';

export interface SimilarityReason {
  type: SimilarityReasonType;
  description: string;
  weight: number;
  evidence: string[];
}

export interface SimilarIncident {
  incidentId: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
  closedAt: string | null;
  similarity: number;
  reasons: SimilarityReason[];
}

export interface SimilarIncidentsResponse {
  items: SimilarIncident[];
  total: number;
}

// ─── INC-004: Incident-Scoped Event Search ───────────────────────────────────

export interface IncidentEventSearchRequest {
  query: string;
  timeRange?: { from: string; to: string };
  entities?: string[];
  limit?: number;
  cursor?: unknown[];
  projection?: string[];
}

export type EventSearchResult = Record<string, unknown>;

export interface IncidentEventSearchResponse {
  items: EventSearchResult[];
  cursor: unknown[] | null;
  total: number;
  truncated: boolean;
}

// ─── INC-005: Response Actions ───────────────────────────────────────────────

export type ActionCategory = 'containment' | 'eradication' | 'recovery' | 'investigation';

export interface ResponseAction {
  id: string;
  name: string;
  description: string;
  category: ActionCategory;
  targets: string[];
  enabled: boolean;
  requiredEntities: string[];
  requiresApproval?: boolean;
  targetType?: string;
}

export interface ActionTarget {
  id: string;
  type: string;
  value: string;
}

export interface ActionImpact {
  description: string;
  affectedSystems: string[];
  reversible: boolean;
}

export interface ActionPreview {
  actionId: string;
  name: string;
  targets: ActionTarget[];
  impact: ActionImpact;
  previewToken: string;
  expiresAt: string;
  executionReady: boolean;
}

export interface ExecuteActionBody {
  previewToken: string;
  notes?: string;
}

export interface ExecuteActionResponse {
  jobId: string;
  status: string;
}

// ─── INC-006: Activity Feed ──────────────────────────────────────────────────

export type ActivityType =
  | 'note'
  | 'field_change'
  | 'task_completed'
  | 'response_action'
  | 'alert_linked'
  | 'evidence_added';

export interface ActivityActor {
  id: string;
  displayName: string;
  avatar: string | null;
}

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  actor: ActivityActor;
  timestamp: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ActivityFeedResponse {
  items: ActivityEntry[];
  cursor: string | null;
}

export interface AddNoteBody {
  content: string;
  mentions?: string[];
}

// ─── INC-007: Evidence Provenance ────────────────────────────────────────────

export type CustodyAction = 'collected' | 'analyzed' | 'transferred' | 'archived' | 'exported';
export type EvidenceClassification = 'unclassified' | 'internal' | 'confidential' | 'restricted';

export interface CustodyEvent {
  actor: string;
  action: CustodyAction;
  timestamp: string;
  notes: string | null;
}

export interface EvidenceProvenance {
  id: string;
  title: string;
  type: string;
  sourceSystem: string;
  collectedAt: string;
  createdAt: string;
  sha256: string;
  classification: EvidenceClassification;
  size: number;
  custodyEvents: CustodyEvent[];
}

export interface AddCustodyEventBody {
  action: CustodyAction;
  notes?: string;
}

export interface UpdateEvidenceClassificationBody {
  classification: EvidenceClassification;
  notes?: string;
}

// ─── INC-008: SSE Events ─────────────────────────────────────────────────────

export type SseEventType =
  | 'incident.updated'
  | 'task.updated'
  | 'activity.created'
  | 'evidence.created'
  | 'evidence.updated'
  | 'response_action.completed';

export interface IncidentSseEvent {
  id: string;
  type: SseEventType;
  timestamp: string;
  data: Record<string, unknown>;
  actor: ActivityActor | null;
}
