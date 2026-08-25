/**
 * EDR (Endpoint Detection and Response) type definitions for HiveArmor.
 *
 * This module is the base type layer for Sprint 16 EDR investigation UX.
 * It will be extended in T02–T05 with timeline, quarantine, FIM, and policy types.
 */

// ---------------------------------------------------------------------------
// Event type union — declaration order is intentional and matches the
// ECharts scatter Y-axis category ordering in TimelineChart.tsx (T02).
// ---------------------------------------------------------------------------

export type EdrEventType =
  | 'process_start'
  | 'process_end'
  | 'network_connect'
  | 'network_listen'
  | 'file_create'
  | 'file_modify'
  | 'file_delete'
  | 'registry_set'
  | 'registry_delete'
  | 'user_logon'
  | 'user_logoff';

// ---------------------------------------------------------------------------
// Process tree
// ---------------------------------------------------------------------------

/**
 * A single process node returned by GET /api/ha-edr/process-tree.
 *
 * All fields except `pid`, `ppid`, and `name` are optional because the
 * backend may not have every attribute available for every process record.
 *
 * The `children` field is populated client-side by `buildProcessTree` in
 * `edrService.ts` — it is NOT present in the raw API response.
 */
export interface ProcessNodeDTO {
  pid: number;
  ppid: number;
  name: string;
  cmdline?: string;
  user?: string;
  startTime?: string;      // ISO 8601
  endTime?: string;        // ISO 8601 or empty string
  suspicious?: boolean;
  children?: ProcessNodeDTO[];
}

/**
 * Query parameters accepted by `useProcessTree` and forwarded to
 * GET /api/ha-edr/process-tree.
 */
export interface ProcessTreeQueryParams {
  agentId: string;
  timestamp: string;       // ISO 8601 anchor point
  windowMinutes: number;   // time window around the anchor (default 30)
}

// ---------------------------------------------------------------------------
// EDR event
// ---------------------------------------------------------------------------

/**
 * A single EDR event returned inside an `EdrTimelinePage` from
 * GET /api/ha-edr/timeline.
 *
 * `details` is an open-ended map of event-specific metadata displayed
 * in the Monaco raw-JSON drawer (T02). Typed as `Record<string, unknown>`
 * to avoid `any` while still allowing arbitrary backend payloads.
 */
export interface EdrEventDTO {
  id: string;
  agentId: string;
  eventType: EdrEventType;
  severity: number;        // 0..100
  timestamp: string;       // ISO 8601
  processName: string;
  pid: number;
  user: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Timeline (T02)
// ---------------------------------------------------------------------------

/**
 * Query parameters for GET /api/ha-edr/timeline.
 */
export interface EdrTimelineQuery {
  agentId: string;
  from: string;       // ISO 8601
  to: string;         // ISO 8601
  types?: EdrEventType[];
  page: number;
  size: number;
}

/**
 * Paginated response from GET /api/ha-edr/timeline.
 * Mirrors Spring's `Page<EdrEventDTO>` shape.
 */
export interface EdrTimelinePage {
  content: EdrEventDTO[];
  totalElements: number;
  totalPages: number;
  number: number;      // zero-based current page index
}

// ---------------------------------------------------------------------------
// Quarantine (T03)
// ---------------------------------------------------------------------------

/**
 * A single quarantined file record returned by GET /api/ha-edr/quarantine.
 * Mirrors the backend `QuarantinedFileDTO` shape.
 */
export interface QuarantinedFileDTO {
  id: number;
  agentId: string;
  agentName?: string;
  filename: string;
  filePath: string;
  sha256Hash?: string;
  fileSize?: number;
  quarantineTime: string;  // ISO 8601
  status: string;          // 'quarantined' | 'restored' | 'deleted'
  quarantinedBy?: string;
  notes?: string;
  /** Optional enriched projection fields used by the response workbench. */
  verdict?: 'malicious' | 'suspicious' | 'unknown' | 'false_positive';
  threatName?: string;
  detectionName?: string;
  signer?: string;
  tenantName?: string;
  source?: string;
  connectorState?: 'healthy' | 'degraded' | 'offline';
  firstSeen?: string;
  lastSeen?: string;
  linkedAlertId?: string;
  linkedIncidentId?: string;
  actionState?: 'complete' | 'pending' | 'failed';
}

/**
 * Request body for PATCH /api/ha-edr/quarantine/{id}.
 * Specifies whether to restore or permanently delete the quarantined file.
 */
export interface QuarantineActionRequest {
  action: 'restore' | 'delete';
}

/**
 * Request body for POST /api/ha-edr/quarantine/bulk.
 * Applies a single action to multiple quarantine records by ID.
 */
export interface QuarantineBulkRequest {
  ids: number[];
  action: 'restore' | 'delete';
}

/**
 * Query parameters accepted by `useQuarantinedFiles` and forwarded to
 * GET /api/ha-edr/quarantine.
 */
export interface QuarantineListQuery {
  agentId?: string;
  status?: string;
  page: number;
  size: number;
}

/**
 * Paginated response from GET /api/ha-edr/quarantine.
 * Mirrors {@code HaEdrInventoryPageDTO} (Spring page fields + list freshness).
 */
export interface QuarantinePage {
  content: QuarantinedFileDTO[];
  totalElements: number;
  totalPages: number;
  number: number;  // zero-based current page index
  /** Server read time for this page (ISO-8601). */
  snapshotAt?: string;
  /**
   * Newest quarantineTime on this page (ISO-8601), or absent when empty.
   * Not a cursor/PIT bound — STAGING CANDIDATE honesty only.
   */
  asOf?: string | null;
  stale?: boolean;
  partialFailures?: Array<{ source: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Host isolation inventory (RESP-021 STAGING CANDIDATE)
// ---------------------------------------------------------------------------

/**
 * A single host isolation record from GET /api/ha-edr/isolation.
 * Mirrors backend `IsolatedHostDTO`. Status values match persistence:
 * ACTIVE | LIFTED | FAILED.
 */
export interface IsolatedHostDTO {
  id: number;
  agentId: string;
  hostname?: string;
  isolationType: string;
  status: string;
  reason?: string;
  allowedIps?: string;
  isolatedAt: string;
  liftedAt?: string | null;
  actionedBy: string;
  edrEventId?: number | null;
}

export interface IsolationListQuery {
  status?: string;
  page: number;
  size: number;
}

export interface IsolationPage {
  content: IsolatedHostDTO[];
  totalElements: number;
  totalPages: number;
  number: number;
  /** Server read time for this page (ISO-8601). */
  snapshotAt?: string;
  /**
   * Newest isolatedAt on this page (ISO-8601), or absent when empty.
   * Not cursor/PIT-bound — STAGING CANDIDATE honesty only.
   */
  asOf?: string | null;
}

// ---------------------------------------------------------------------------
// File Integrity Monitoring — FIM (T04)
// ---------------------------------------------------------------------------

/**
 * A single time-series data point returned inside `FimSummaryDTO.changesOverTime`.
 * Counts represent the number of FIM change events of each type within the
 * bucket interval.
 */
export interface TimeSeriesPoint {
  timestamp: string;   // ISO 8601 bucket start
  create: number;
  modify: number;
  delete: number;
  rename: number;
}

/**
 * A path and its associated change count, used in `FimSummaryDTO.topPaths`.
 */
export interface PathCountDTO {
  path: string;
  count: number;
}

/**
 * A suspicious file hash record returned inside `FimSummaryDTO.suspiciousHashes`.
 * `threatIntelHit` is `true` when the hash matched a threat-intel feed entry.
 */
export interface SuspiciousHashDTO {
  sha256Hash: string;
  filename: string;
  firstSeen: string;      // ISO 8601
  lastSeen: string;       // ISO 8601
  endpointCount: number;
  threatIntelHit: boolean;
}

/**
 * Aggregated FIM summary returned by GET /api/ha-edr/fim/summary.
 */
export interface FimSummaryDTO {
  changesOverTime: TimeSeriesPoint[];
  topPaths: PathCountDTO[];
  suspiciousHashes: SuspiciousHashDTO[];
}

/**
 * Query parameters accepted by `useFimSummary` and forwarded to
 * GET /api/ha-edr/fim/summary.
 *
 * `agentIds` and `changeTypes` are optional filters — when omitted the
 * backend returns data across all agents / all change types.
 */
export interface FimSummaryQuery {
  from: string;   // ISO 8601
  to: string;     // ISO 8601
  agentIds?: string[];
  changeTypes?: Array<'create' | 'modify' | 'delete' | 'rename'>;
}

// ---------------------------------------------------------------------------
// Agent Policy Management (T05)
// ---------------------------------------------------------------------------

/**
 * An agent monitoring policy record returned by GET /api/ha-edr/policies
 * and related endpoints. Mirrors the backend `AgentPolicyDTO` shape.
 *
 * `filePaths` and `registryPaths` are stored as JSON-encoded TEXT on the
 * backend and arrive here already deserialized as string arrays.
 * `assignedAgentIds` carries the UUIDs of agents currently enrolled in this
 * policy.
 */
export interface AgentPolicyDTO {
  id?: number;
  name: string;
  osType?: string;
  filePaths?: string[];
  registryPaths?: string[];
  networkMonitor?: boolean;
  processMonitor?: boolean;
  assignedAgentIds?: string[];
  createdAt?: string;   // ISO 8601
  updatedAt?: string;   // ISO 8601
}

/**
 * Form input shape used when creating or updating an agent policy.
 * Identical to `AgentPolicyDTO` minus the server-managed fields `id`,
 * `createdAt`, and `updatedAt`.
 */
export interface AgentPolicyFormValues {
  name: string;
  osType?: string;
  filePaths?: string[];
  registryPaths?: string[];
  networkMonitor?: boolean;
  processMonitor?: boolean;
  assignedAgentIds?: string[];
}

/**
 * Agent-reported policy ack/state — mirrors backend `AgentPolicyStateDTO`.
 * Presence does not prove production host enforcement (POL-001 / POL-003).
 * Apply/ack evidence requires `appliedVersion` or `lastAppliedAt` — never treat bare
 * `state` alone as enforced on host.
 */
export interface AgentPolicyStateDTO {
  id?: number;
  agentId?: string;
  policyId?: number;
  appliedVersion?: number | null;
  desiredVersion?: number | null;
  state?: string | null;
  lastCheckedAt?: string | null;
  lastAppliedAt?: string | null;
  driftDetails?: string | null;
}

/** Honesty envelope from GET /api/ha-edr/policies/{id}/enforcement (STAGING CANDIDATE). */
export type AgentPolicyEvidenceAvailability = 'unavailable' | 'partial';

export interface AgentPolicyEnforcementEvidenceDTO {
  policyId: number;
  assignedAgentIds: string[];
  evidenceAvailability: AgentPolicyEvidenceAvailability;
  honestyNote: string;
  /**
   * True only when a state row carries appliedVersion or lastAppliedAt.
   * False ⇒ apply/ack path unavailable — never “enforced on host”.
   * True still does not mean LIVE VERIFIED host enforcement.
   */
  applyAckPathAvailable: boolean;
  agentStates: AgentPolicyStateDTO[];
}
