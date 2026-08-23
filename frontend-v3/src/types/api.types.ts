/**
 * API Contract Types — All DTOs
 * Complete implementation per spec 09-API-CONTRACT.md
 */

import type { SeverityLevel } from '@/constants/severity.constants';
import type { AlertStatus } from '@/constants/status.constants';

// ===== Core API Utilities =====

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface ApiErrorResponse {
  status: number;
  title?: string;
  detail?: string;
  message?: string;
  fieldErrors?: { field: string; message: string }[];
}

// ===== Auth =====

export interface AuthenticateRequest {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthenticateResponse {
  token?: string; // Backend uses "token"
  id_token?: string; // Alternative field name
  tfaConfigured?: boolean;
  firstLogin?: boolean;
  success?: boolean;
  forceTfa?: boolean;
  method?: string | null;
  tfaExpiresInSeconds?: number;
}

export interface AccountDTO {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  activated: boolean;
  langKey: string;
  authorities: string[];
  imageUrl?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordInitRequest {
  mail: string;
}

export interface ResetPasswordFinishRequest {
  key: string;
  newPassword: string;
}

// ===== Alerts =====

export interface AlertStatusUpdateRequest {
  alertIds: string[];
  status: number;
  statusObservation?: string;
  addFalsePositiveTag?: boolean;
}

export interface AlertNotesRequest {
  alertIds: string[];
  note: string;
}

export interface AlertTagsRequest {
  alertIds: string[];
  tags: string[];
  createRule: boolean;
}

export interface ConvertToIncidentRequest {
  alertIds: string[];
  incidentName: string;
  incidentId?: number;
  incidentSource?: string;
}

export interface OpenAlertCountResponse {
  count: number;
}

// ===== Incidents =====

/** Body for POST /api/ha-incidents — matches NewIncidentDTO (alerts required). */
export interface CreateIncidentRequest {
  incidentName: string;
  incidentDescription?: string;
  incidentAssignedTo?: string;
  alertList: Array<{
    alertId: string;
    alertName: string;
    alertStatus: number;
    alertSeverity: number;
  }>;
}

/** Body for POST /api/ha-incidents/add-alerts — matches AddToIncidentDTO. */
export interface AddAlertsToIncidentRequest {
  incidentId: number;
  alertList: Array<{
    alertId: string;
    alertName: string;
    alertStatus: number;
    alertSeverity: number;
  }>;
}

/** Body for PUT /api/ha-incidents/change-status — matches UtmIncident status fields. */
export interface ChangeIncidentStatusRequest {
  id: number;
  incidentStatus: 'OPEN' | 'IN_REVIEW' | 'COMPLETED' | 'MERGED';
  incidentSolution?: string | null;
}

export interface UserRef {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
}

export interface TenantRef {
  id: number;
  name: string;
}

export interface MitreTechniqueRef {
  id: string;
  name: string;
  tactic: string;
}

export interface IncidentDTO {
  id: number;
  title: string;
  description: string;
  severity: SeverityLevel;
  status: AlertStatus;
  assignee: UserRef | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  slaDueAt: string | null;
  alertCount: number;
  evidenceCount: number;
  noteCount: number;
  tenant: TenantRef;
  mitreTechniques: MitreTechniqueRef[];
}

export interface AlertRef {
  id: string;
  title: string;
  severity: SeverityLevel;
  status: AlertStatus;
  createdAt: string;
}

export interface IncidentDetailDTO extends IncidentDTO {
  alerts: AlertRef[];
}

export interface EntityGraph {
  nodes: EntityNode[];
  edges: EntityEdge[];
}

export interface EntityNode {
  id: string;
  type: 'host' | 'user' | 'ip' | 'domain' | 'process' | 'file' | 'alert';
  label: string;
  severity?: SeverityLevel;
  alertCount?: number;
  metadata?: Record<string, string>;
}

export interface EntityEdge {
  source: string;
  target: string;
  label?: string;
  timestamp?: string;
}

export interface EvidenceItem {
  id: string;
  type: 'screenshot' | 'log_excerpt' | 'file_hash' | 'file' | 'network_capture' | 'note';
  title: string;
  source: string;
  timestamp: string;
  content: string;
  analystNote?: string;
  addedBy: string;
  addedAt: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'alert' | 'status_change' | 'note' | 'assignment' | 'entity_activity' | 'automation';
  title: string;
  description?: string;
  actor?: string;
  severity?: SeverityLevel;
  metadata?: Record<string, string>;
}

export interface IncidentEntity {
  id: string;
  type: 'host' | 'user' | 'ip' | 'domain' | 'process' | 'file';
  label: string;
  riskScore: number;
  alertCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface AiSummaryResponse {
  summary: string;
  generatedAt: string;
}

// ===== Correlation Rules =====

export interface CorrelationRuleDTO {
  id: number;
  name: string;
  description?: string;
  category: string;
  severity: SeverityLevel;
  active: boolean;
  ruleDefinition: string;
  mitreTechniques?: MitreTechniqueRef[];
  matchCount?: number;
  lastUpdate: string;
  createdBy?: string;
  tenantId?: number;
}

export interface RuleTestRequest {
  ruleDefinition: string;
  timeFrom: string;
  timeTo: string;
}

export interface RuleTestResult {
  matchedEvents: EventRecord[];
  totalMatches: number;
  executionTimeMs: number;
  errors?: string[];
}

export interface RuleImportRequest {
  file: File;
  format: 'native' | 'sigma';
}

export interface RuleImportResult {
  imported: number;
  failed: number;
  errors?: { ruleIndex: number; message: string }[];
}

export interface RulePack {
  name: string;
  displayName: string;
  description: string;
  ruleCount: number;
  category: string;
  version: string;
  installed: boolean;
  installedAt?: string;
}

// ===== Dashboards =====

export interface DashboardDTO {
  id: number;
  title: string;
  description?: string;
  isPublic: boolean;
  ownerId: number;
  tenantId?: number;
  widgets: WidgetSpec[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DashboardListItemDTO {
  id: number;
  title: string;
  description?: string;
  isPublic: boolean;
  ownerId: number;
  widgetCount: number;
  updatedAt: string;
}

export interface WidgetSpec {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export interface SidebarOrderRequest {
  dashboardIds: number[]; // ordered array
}

export interface ImportDashboardRequest {
  spec: DashboardSpec;
}

export interface DashboardSpec {
  title: string;
  description?: string;
  widgets: WidgetSpec[];
}

// ===== Users =====

export interface UserDTO {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  activated: boolean;
  langKey: string;
  authorities: string[];
  createdBy?: string;
  createdDate?: string;
  lastModifiedBy?: string;
  lastModifiedDate?: string;
  imageUrl?: string;
}

export interface CreateUserRequest {
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  authorities: string[];
  langKey: string;
  activated: boolean;
}

export type UpdateUserRequest = CreateUserRequest & { id: number };

// ===== Clients/Tenants =====

export interface ClientDTO {
  id: number;
  name: string;
  description?: string;
  createdAt?: string;
}

// ===== Audit Events =====

export interface AuditEventDTO {
  id: string;
  timestamp: string;
  actor: string;
  actorIp?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: string;
  newValue?: string;
  source: 'application' | 'system';
  tenantId?: number;
}

// ===== Search =====

export type SearchDataset = 'all' | 'alerts' | 'logs' | 'threats';
export type QueryMode = 'nl' | 'dsl';

export interface TimeRange {
  from: string;
  to: string;
}

export interface NlQueryRequest {
  query: string;
  dataset: SearchDataset;
  timeRange: TimeRange;
  page: number;
  size: number;
}

export interface NlQueryResponse {
  results: EventRecord[];
  total: number;
  timeBuckets: TimeBucket[];
  generatedDsl?: string;
  executionTimeMs: number;
}

export interface TimeBucket {
  timestamp: string;
  count: number;
}

export interface EventRecord {
  id: string;
  timestamp: string;
  dataType: string;
  severity?: SeverityLevel;
  sourceIp?: string;
  destinationIp?: string;
  sourcePort?: number;
  destinationPort?: number;
  user?: string;
  host?: string;
  message?: string;
  tenantId?: number;
  raw: Record<string, unknown>;
  mitreTags?: string[];
  threatIntelMatches?: ThreatIntelMatch[];
  indexName?: string;
}

export interface ThreatIntelMatch {
  indicator: string;
  type: 'ip' | 'domain' | 'hash' | 'url';
  feedName: string;
  confidence: number;
}

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  mode: QueryMode;
  dataset: SearchDataset;
  timeRange?: TimeRange;
  createdAt: string;
  createdBy: string;
}

// ===== SOC AI =====

export interface SocAiQueryRequest {
  question: string;
  context?: {
    incidentId?: number;
    alertIds?: string[];
    timeRange?: TimeRange;
  };
}

export interface SocAiQueryResponse {
  answer: string;
  sources?: string[];
  confidence?: number;
}

export interface EnrichAlertRequest {
  alertId: string;
}

export interface EnrichAlertResponse {
  enrichments: {
    field: string;
    value: string;
    source: string;
  }[];
}

// ===== Alerts =====

export interface UtmAlert {
  id: string;
  name: string;
  '@timestamp': string;
  timestamp: string;
  severity: number;
  severityLabel: string;
  status: number;
  statusLabel?: string;
  statusObservation?: string;
  category?: string;
  description?: string;
  dataType?: string;
  tags?: string[];
  adversary?: { name?: string; ip?: string; host?: string };
  target?: { name?: string; ip?: string; host?: string };
  notes?: string;
  parentId?: string;
  isIncident?: boolean;
  // Sprint 13 — MITRE ATT&CK metadata fields (T01)
  mitreTacticId?: string;
  mitreTacticName?: string;
  mitreTechniqueId?: string;
  mitreTechniqueName?: string;
  mitreTechniqueUrl?: string;
  killChainPhase?: string;
  // Sprint 13 — Risk score and detection confidence (T02)
  riskScore?: number;
  confidence?: number;
  // Sprint 13 — Threat intelligence match fields (T03)
  threatIntelMatched?: boolean;
  threatIntelIndicatorType?: 'ip' | 'domain' | 'hash' | 'url' | 'email';
  threatIntelSource?: string;
  threatIntelTlp?: string;         // narrowed to a union in Sprint 19 (TlpBadge)
  threatIntelConfidence?: number;
  // Sprint 13 — MSSP/SLA/Asset/SOAR fields (T04)
  tenantId?: string;
  tenantName?: string;
  slaDeadline?: string;
  slaBreached?: boolean;
  assetId?: string;
  assetCriticality?: number;
  assetOwner?: string;
  soarPlaybookId?: string;
  soarExecutionStatus?: 'triggered' | 'running' | 'completed' | 'failed';
}

// ===== Alert Response Rules =====

export interface AlertResponseRuleDTO {
  id: number;
  name: string;
  active: boolean;
  ruleDefinition: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SoarPlaybookDTO {
  id?: number;
  name: string;
  active: boolean;
  description?: string;
  graphDefinition: string;  // JSON serialized { nodes, edges }
  createdAt?: string;
  updatedAt?: string;
}
