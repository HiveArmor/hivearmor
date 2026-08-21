import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';

export type InvestigationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface InvestigationStage {
  id: string;
  order: number;
  tacticId: string;
  label: string;
  technique: string;
  state: 'observed' | 'suspected' | 'not_observed';
  eventCount: number;
}

export interface InvestigationStoryEvent {
  id: string;
  timestamp: string;
  title: string;
  summary: string;
  category: 'process' | 'file' | 'network' | 'registry' | 'identity' | 'detection';
  severity: InvestigationSeverity;
  processId: string | null;
  source: string;
  stageId: string | null;
  evidenceIds: string[];
}

export interface InvestigationProcess {
  id: string;
  parentId: string | null;
  name: string;
  pid: number;
  user: string;
  commandLine: string;
  startedAt: string;
  verdict: 'malicious' | 'suspicious' | 'unknown' | 'trusted';
  signed: boolean | null;
}

export interface InvestigationNetworkConnection {
  id: string;
  timestamp: string;
  processId: string | null;
  processName: string;
  protocol: string;
  destination: string;
  port: number;
  direction: 'outbound' | 'inbound';
  bytes: number;
  reputation: 'malicious' | 'suspicious' | 'unknown' | 'trusted';
  state: string;
}

export interface InvestigationIndicator {
  id: string;
  type: 'ip' | 'domain' | 'url' | 'sha256' | 'sha1' | 'md5' | 'registry' | 'email';
  value: string;
  verdict: 'malicious' | 'suspicious' | 'unknown' | 'trusted';
  confidence: number | null;
  source: string;
  firstSeen: string | null;
  lastSeen: string | null;
  evidenceIds: string[];
}

export interface InvestigationCapability {
  id: string;
  label: string;
  description: string;
  severity: InvestigationSeverity;
  evidenceCount: number;
}

export interface InvestigationEntity {
  id: string;
  type: 'user' | 'host' | 'ip' | 'process' | 'file' | 'domain' | 'rule';
  label: string;
  role: 'actor' | 'target' | 'observer' | 'artifact';
  riskScore: number | null;
  evidenceCount: number;
}

export interface RelatedInvestigationAlert {
  id: string;
  title: string;
  severity: InvestigationSeverity;
  timestamp: string;
  relation: string;
  sharedEntities: string[];
}

export interface InvestigationHistoryItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export interface InvestigationResponseAction {
  id: string;
  label: string;
  description: string;
  tone: 'primary' | 'danger' | 'neutral';
  target: string;
  available: boolean;
  unavailableReason: string | null;
  requiresApproval: boolean;
}

export interface AlertInvestigation {
  id: string;
  title: string;
  summary: string;
  severity: InvestigationSeverity;
  status: string;
  verdict: 'malicious' | 'suspicious' | 'benign' | 'unknown';
  riskScore: number | null;
  confidence: number | null;
  occurredAt: string;
  updatedAt: string;
  detector: string;
  dataSource: string;
  tenant: string | null;
  asset: string | null;
  assetOwner: string | null;
  slaDeadline: string | null;
  rule: {
    id: string | null;
    name: string | null;
    reason: string;
    investigationGuide: string[];
  };
  stages: InvestigationStage[];
  story: InvestigationStoryEvent[];
  processes: InvestigationProcess[];
  network: InvestigationNetworkConnection[];
  indicators: InvestigationIndicator[];
  capabilities: InvestigationCapability[];
  entities: InvestigationEntity[];
  relatedAlerts: RelatedInvestigationAlert[];
  history: InvestigationHistoryItem[];
  actions: InvestigationResponseAction[];
  highlightedFields: Record<string, string>;
  rawEvent: Record<string, unknown>;
  dataCompleteness: 'full' | 'core';
  missingDataNotice: string | null;
}

export interface AlertInvestigationSource {
  alert: AlertDetailDTO;
}

// --- Sub-resource response types (Sprint 39) ---

/** ALT-002: Attack story response */
export interface AlertStoryResponse {
  stages: InvestigationStage[];
  items: InvestigationStoryEvent[];
}

/** ALT-008: Activity feed response */
export interface AlertActivityResponse {
  items: InvestigationHistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** ALT-008: Individual activity item with enriched metadata */
export interface AlertActivityItem {
  id: string;
  timestamp: string;
  type: 'creation' | 'status_change' | 'note' | 'tag' | 'assignment' | 'playbook';
  actor: string;
  action: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

/** ALT-009: Detection guide response */
export interface AlertGuideResponse {
  alertReason: string;
  ruleDescription: string | null;
  steps: string[];
  mitre: {
    tacticId: string;
    tacticName: string;
    techniqueId: string;
    techniqueName: string;
    url: string;
  } | null;
}

/** ALT-011: Individual highlighted field from event detail */
export interface AlertEventHighlightedField {
  key: string;
  value: string;
  type: 'ip' | 'hostname' | 'username' | 'hash' | 'path' | 'process' | 'port' | 'timestamp' | 'string' | 'number';
  emphasis: 'critical' | 'warning' | 'neutral';
  order: number;
}

/** ALT-011: Highlighted event detail response */
export interface AlertEventHighlightedResponse {
  fields: AlertEventHighlightedField[];
}

/** ALT-011: Raw event detail response */
export interface AlertEventRawResponse {
  raw: Record<string, unknown>;
}

// --- Telemetry sub-resource types (Sprint 40) ---

/** ALT-003: Process lineage tree node */
export interface ProcessNode {
  id: string;
  pid: number;
  name: string;
  commandLine: string;
  user: string;
  startTime: string;
  endTime: string | null;
  verdict: 'malicious' | 'suspicious' | 'benign' | 'unknown';
  signature: { signed: boolean; signer: string | null; verified: boolean };
  depth: number;
  parentId: string | null;
  children: ProcessNode[];
}

/** ALT-003: Process tree response */
export interface ProcessTreeResponse {
  tree: ProcessNode[];
  alertProcessIds: string[];
  totalProcesses: number;
}

/** ALT-004: Network connection */
export interface NetworkConnection {
  id: string;
  timestamp: string;
  protocol: string;
  transport: string;
  sourceIp: string;
  sourcePort: number;
  destIp: string;
  destPort: number;
  bytesIn: number;
  bytesOut: number;
  duration: number;
  direction: 'outbound' | 'inbound' | 'lateral';
  processId: string;
  processName: string;
}

/** ALT-004: DNS record */
export interface DnsRecord {
  queryName: string;
  queryType: string;
  responseIps: string[];
  timestamp: string;
}

/** ALT-004: TLS record */
export interface TlsRecord {
  serverName: string;
  ja3Hash: string;
  ja3sHash: string;
  version: string;
  issuer: string;
  subject: string;
  notAfter: string;
}

/** ALT-004: IP reputation entry */
export interface IpReputation {
  score: number;
  category: string;
  source: string;
}

/** ALT-004: Network activity response */
export interface NetworkActivityResponse {
  connections: NetworkConnection[];
  dns: DnsRecord[];
  tls: TlsRecord[];
  reputation: Record<string, IpReputation>;
  totalConnections: number;
}

/** ALT-005: Indicator / IOC */
export interface Indicator {
  id: string;
  type: string;
  value: string;
  verdict: 'malicious' | 'suspicious' | 'benign' | 'unknown';
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  sources: string[];
  tlp: string;
  prevalence: { globalHits: number; tenantHits: number; firstGlobalSeen: string };
  context: string;
}

/** ALT-005: Indicators response */
export interface IndicatorsResponse {
  indicators: Indicator[];
  totalCount: number;
  enrichmentStatus: 'complete' | 'partial' | 'unavailable';
}

/** ALT-007: Correlation reason */
export interface CorrelationReason {
  type: string;
  description: string;
  strength: 'strong' | 'moderate' | 'weak';
  evidence: string;
}

/** ALT-007: Related alert */
export interface RelatedAlert {
  id: string;
  title: string;
  severity: string;
  status: number;
  timestamp: string;
  correlationReasons: CorrelationReason[];
  riskScore: number;
  primaryEntity: string;
  ruleName: string;
}

/** ALT-007: Related alerts response */
export interface RelatedAlertsResponse {
  relatedAlerts: RelatedAlert[];
  totalCount: number;
}

/** ALT-001: Enhanced alert detail fields (extends existing AlertInvestigation) */
export interface EnhancedAlertDetail {
  detection: {
    ruleId: string | null;
    ruleName: string | null;
    detector: string | null;
    dataSources: string[];
  };
  asset: {
    id: string | null;
    name: string | null;
    owner: string | null;
    criticality: 'critical' | 'high' | 'medium' | 'low';
  };
  counts: {
    events: number;
    processes: number;
    connections: number;
    indicators: number;
    relatedAlerts: number;
  };
  verdict: string;
  snapshotVersion: number;
  summary?: string | null;
  renderedReason?: string | null;
  updatedAt?: string | null;
  primaryEntity?: {
    id: string;
    type: string;
    label: string;
    riskScore: number | null;
  } | null;
  availableActions?: Array<{
    id: string;
    allowed: boolean;
    reason: string | null;
    requiresPreview: boolean;
  }>;
}

// --- Advanced investigation types (Sprint 41) ---

/** ALT-006: Entity relationship graph node */
export interface GraphNode {
  id: string;
  type: string;
  label: string;
  role: string;
  riskScore: number;
  metadata: Record<string, unknown>;
}

/** ALT-006: Entity relationship graph edge */
export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  direction: string;
  strength: string;
  evidence: string;
  timestamp: string;
}

/** ALT-006: Entity graph response */
export interface EntityGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    truncated: boolean;
  };
}

/** ALT-010: Action parameter definition */
export interface ActionParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

/** ALT-010: Response action definition */
export interface ResponseAction {
  id: string;
  name: string;
  description: string;
  category: string;
  targetType: string;
  parameters: ActionParameter[];
  integrationStatus: string;
  riskLevel: string;
  requiredRole: string;
}

/** ALT-010: Impact item within an action preview */
export interface ImpactItem {
  description: string;
  scope: string;
  affectedEntities: string[];
}

/** ALT-010: Action preview response */
export interface ActionPreview {
  actionId: string;
  targetSummary: string;
  impact: ImpactItem[];
  reversible: boolean;
  estimatedDuration: string;
  warnings: string[];
  requiresApproval: boolean;
  previewToken: string;
}

/** ALT-010: Response job status */
export interface ResponseJob {
  jobId: string;
  status: string;
  actionId: string;
  targetId: string;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/** ALT-012: SSE event — alert field updated */
export interface AlertUpdatedEvent {
  type: 'alert.updated';
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actor: string;
  timestamp: string;
}

/** ALT-012: SSE event — new story item appended */
export interface StoryAppendedEvent {
  type: 'story.appended';
  item: InvestigationStoryEvent;
}

/** ALT-012: SSE event — process tree updated */
export interface ProcessUpdatedEvent {
  type: 'process.updated';
  node: ProcessNode;
}

/** ALT-012: SSE event — new network connection observed */
export interface NetworkAppendedEvent {
  type: 'network.appended';
  connection: NetworkConnection;
}

/** ALT-012: SSE event — indicator enrichment update */
export interface IndicatorEnrichedEvent {
  type: 'indicator.enriched';
  indicatorId: string;
  field: string;
  newValue: unknown;
  source: string;
}

/** ALT-012: SSE event — response action job status changed */
export interface ResponseStatusEvent {
  type: 'response.status';
  jobId: string;
  status: string;
  result?: string;
}

/** ALT-012: Discriminated union of all investigation SSE event types */
export type InvestigationStreamEvent =
  | AlertUpdatedEvent
  | StoryAppendedEvent
  | ProcessUpdatedEvent
  | NetworkAppendedEvent
  | IndicatorEnrichedEvent
  | ResponseStatusEvent;
