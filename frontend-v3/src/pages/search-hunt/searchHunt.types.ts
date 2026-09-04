export type HuntSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type HuntFieldType = 'date' | 'keyword' | 'text' | 'ip' | 'number' | 'boolean';
export type HuntRowDensity = 'compact' | 'standard' | 'comfortable';

export interface HuntTimeRange {
  from: string;
  to: string;
}

export interface HuntHistogramBucket {
  from: string;
  to: string;
  count: number;
}

export interface HuntFieldDefinition {
  name: string;
  label: string;
  type: HuntFieldType;
  category: 'event' | 'host' | 'identity' | 'network' | 'process' | 'source' | 'other';
  description: string;
  operators: string[];
  coverage: number | null;
  cardinality?: number;
  sampleValues?: string[];
}

export interface HuntFieldValue {
  value: string;
  count: number;
  countIsExact: boolean;
  includeQuery: string;
  excludeQuery: string;
}

export interface HuntFieldValuesResponse {
  field: string;
  searchId: string;
  items: HuntFieldValue[];
  nextCursor: string | null;
  hasMore: boolean;
  totalDistinctApproximate: number | null;
  totalIsExact: boolean;
  state: 'available' | 'high_cardinality' | 'sensitive' | 'unavailable' | 'redacted';
  snapshotAt: string;
}

/** HNT-003: per-field coverage %/cardinality computed against the authorized search snapshot. */
export interface HuntFieldStat {
  name: string;
  coverage: number | null;   // 0..100 (one decimal); null when the snapshot has no docs
  cardinality: number;       // approximate distinct values in the snapshot
}

export interface HuntFieldStatsResponse {
  searchId: string;
  totalDocs: number;
  totalIsExact: boolean;
  fields: HuntFieldStat[];
  state: 'available' | 'partial';
  snapshotAt: string;
}

export interface HuntEvent {
  id: string;
  timestamp: string;
  ingestedAt: string;
  severity: HuntSeverity;
  dataSource: string;
  dataset: string;
  category: string;
  action: string;
  host: string | null;
  user: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  message: string;
  tenantId: string;
  tenantName: string;
  alertCount: number;
  normalized: Record<string, unknown>;
}

export interface HuntEventDetail extends HuntEvent {
  sourceIndex: string;
  schemaVersion: string;
  integrityStatus: 'verified' | 'unverified';
  rawRecord: Record<string, unknown>;
  redactedFields: string[];
  availablePivots: Array<{
    id: string;
    label: string;
    query: string;
  }>;
  permissions: {
    viewRaw: boolean;
    addEvidence: boolean;
    createInvestigation: boolean;
    createIncident: boolean;
  };
}

export interface HuntSearchRequest {
  query: string;
  language: 'kql';
  timeRange: HuntTimeRange;
  tenantScope: 'authorized' | string;
  indexPattern?: string;
  fields: string[];
  cursor: string | null;
  limit: number;
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>;
  includeHistogram: boolean;
}

export interface HuntSearchResponse {
  searchId: string;
  items: HuntEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshotAt: string;
  totalApproximate: number;
  totalIsExact: boolean;
  tookMs: number;
  histogram: HuntHistogramBucket[];
  partialFailures: Array<{ source: string; code: string; message: string }>;
}

export interface HuntActionRequest {
  type: 'add_evidence' | 'create_investigation' | 'create_incident';
  eventIds: string[];
  searchId: string;
  title?: string;
  incidentId?: string;
  reason: string;
}

/** Outcome of a hunt promotion attempt — never invent a "created" success. */
export type HuntActionOutcome = 'created' | 'approval_pending' | 'simulated';

export interface HuntActionResponse {
  /** Resource id when created; approval id when pending; simulation token when simulated. */
  targetId: string;
  auditId: string;
  outcome: HuntActionOutcome;
  approvalId?: string;
}

// Compatibility aliases retained for existing tests and older consumers.
export interface TimeRangeDTO {
  type: 'preset' | 'absolute';
  preset?: '15m' | '1h' | '4h' | '24h' | '7d' | '30d';
  from?: string;
  to?: string;
}

export interface HistogramBucket {
  timestamp: string;
  count: number;
}

export interface EventDTO {
  '@timestamp': string;
  'event.severity'?: number;
  [key: string]: unknown;
}

export interface SearchExecuteRequest {
  query: string;
  timeRange: TimeRangeDTO;
  from: number;
  size: number;
}

export interface SearchExecuteResponse {
  hits: EventDTO[];
  total: number;
  took: number;
  histogram: HistogramBucket[];
}

/** Matches backend UtmSavedQuery /api/ha-saved-queries */
export interface SavedQueryDTO {
  id?: number;
  userLogin?: string;
  queryName: string;
  queryText: string;
  indexPattern?: string | null;
  timeRange?: string | null;
  filters?: string | null;
  isShared?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiQueryRequest { prompt: string; }
export interface AiQueryResponse { query: string; explanation: string; }
export interface ThreatIntelResponse {
  iocValue: string;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  sourceFeed?: string;
  firstSeen?: string;
  lastSeen?: string;
  attackTechniques?: string[];
}

export type FieldBrowserField = HuntFieldDefinition;

// --- Hunt completion types (Sprint 42) ---

/** HNT-002: Query execution plan diagnostics */
export interface QueryPlan {
  indicesSearched: string[];
  filtersApplied: string[];
  sortUsed: string;
  estimatedCost: string;
}

/** HNT-002: Search status / diagnostics response */
export interface SearchStatus {
  searchId: string;
  status: string;
  query: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  totalHits?: number;
  shardsSearched: number;
  shardsSucceeded: number;
  shardsFailed: number;
  timeoutReached: boolean;
  queryPlan?: QueryPlan;
  errors: Array<{ shard: number; reason: string; phase: string }>;
}

/** HNT-004: Highlighted event field (same shape as AlertEventHighlightedField) */
export interface HuntEventField {
  key: string;
  value: string;
  type: string;
  emphasis: 'critical' | 'warning' | 'neutral';
  order: number;
  /** Coarse investigation section for the sectioned field grid (Detection/Network/Assets/…). */
  group?: string;
  /** Server-generated, escaped KQL fragment to filter FOR this field:value (empty when no value). */
  includeQuery?: string;
  /** Server-generated, escaped KQL fragment to filter OUT this field:value (empty when no value). */
  excludeQuery?: string;
}

/** HNT-006: Investigation pivot descriptor */
export interface Pivot {
  id: string;
  label: string;
  description: string;
  field: string;
  value: string;
  query: string;
  signature: string;
  icon: string;
  category: string;
}

/** HNT-004 + HNT-006: Event detail with pivots response */
export interface HuntEventDetailResponse {
  fields?: HuntEventField[];
  raw?: Record<string, unknown>;
  pivots: Pivot[];
}

/** HNT-005: Saved hunt definition */
export interface SavedHunt {
  id: string;
  name: string;
  description: string;
  query: string;
  filters: Record<string, unknown>;
  schedule?: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  runCount: number;
  shared: boolean;
}

/** HNT-005: Hunt history entry */
export interface HistoryEntry {
  id: string;
  query: string;
  filters: Record<string, unknown>;
  executedAt: string;
  duration: number;
  resultCount: number;
  status: string;
  savedHuntId?: string;
}

/** HNT-007: Promotion preview response */
export interface PromotionPreview {
  action: string;
  eventCount: number;
  preview: {
    title: string;
    description: string;
    entities: string[];
    severity?: string;
  };
  warnings: string[];
  previewToken: string;
  /** Escalate/investigation and large evidence batches require SOC Manager approval. */
  approvalRequired?: boolean;
  approvalRequestPath?: string;
  permissionVersion?: string;
  expiresInSeconds?: number;
}

/** HNT-007: Promotion execution result */
export interface PromotionResult {
  actionId: string;
  resultType: string;
  resultId: string;
  status: string;
  url: string;
}

/** HNT-007: SOC Manager approval request (POST /ha-hunts/approvals) */
export interface HuntPromotionApproval {
  approvalId: string;
  searchId: string;
  action: string;
  status: string;
  requester: string;
  tenantKey: string;
  requestRationale: string;
  decisionRationale?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  consumedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
}

/** HNT-009: Query operator definition */
export interface QueryOperator {
  symbol: string;
  name: string;
  description: string;
  example: string;
}

/** HNT-009: Query function definition */
export interface QueryFunction {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string }>;
  returnType: string;
  example: string;
}

/** HNT-009: Field type definition */
export interface QueryFieldType {
  type: string;
  description: string;
  operators: string[];
  sortable: boolean;
  aggregatable: boolean;
}

/** HNT-009: Time range option */
export interface QueryTimeRange {
  label: string;
  value: string;
  description: string;
}

/** HNT-009: Query limits */
export interface QueryLimits {
  maxResults: number;
  maxTimeRange: string;
  maxConcurrent: number;
  queryTimeout: number;
}

/** HNT-009: Query example */
export interface QueryExample {
  title: string;
  description: string;
  query: string;
  category: string;
}

/** HNT-009: Full query capabilities response */
export interface QueryCapabilities {
  operators: QueryOperator[];
  functions: QueryFunction[];
  fieldTypes: QueryFieldType[];
  aggregations: string[];
  timeRanges: QueryTimeRange[];
  limits: QueryLimits;
  examples: QueryExample[];
}

/** HNT-008: SSE search progress event */
export interface SearchProgressEvent {
  type: 'search.progress';
  searchId: string;
  shardsCompleted: number;
  shardsTotal: number;
  hitsFound: number;
}

/** HNT-008: SSE search partial results event */
export interface SearchPartialEvent {
  type: 'search.partial';
  searchId: string;
  newHits: number;
  sampleEvents: Array<{ id: string; timestamp: string; message: string }>;
}

/** HNT-008: SSE search completed event */
export interface SearchCompletedEvent {
  type: 'search.completed';
  searchId: string;
  totalHits: number;
  duration: number;
  diagnostics: {
    shardsSearched: number;
    shardsSucceeded: number;
    shardsFailed: number;
    timeoutReached: boolean;
  };
}
