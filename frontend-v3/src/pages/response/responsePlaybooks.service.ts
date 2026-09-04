/**
 * Response Playbooks Service — Phase 7
 * All calls route through /api/ha-playbooks (PlaybookResource.java — secured with @PreAuthorize).
 * Legacy /api/soar/playbooks (GAP-SEC-08) is no longer used for list/detail/execute operations.
 *
 * Fixture mode is gated by:  import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES === 'true'
 *
 * RESP-001: List playbooks with cursor pagination
 * RESP-002: Preview playbook execution (dry-run)
 * RESP-003: Execute playbook (requires previewToken from RESP-002)
 * RESP-004: Approve or reject a pending execution
 * RESP-005: Cancel a running execution (DELETE /api/ha-playbooks/{executionId})
 * RESP-006: Stream execution steps (SSE)
 * RESP-018: Bounded execution inventory, summary, and progressive trace (gated)
 * Quarantine: use ha-edr quarantine APIs — not playbook quarantine helpers
 * Action catalog: use GET /api/response/actions — not ha-action-catalog helpers
 */


import {
  RESP_018_EXECUTION_INVENTORY,
  RESP_018_SOAR_AUDIT_PROJECTION,
  RESP_018_SOAR_AUDIT_TITLE,
  RESP_020_APPROVAL_PROJECTION,
  RESP_020_GOVERNANCE,
} from './response.capabilities';
import type {
  CursorPageResult,
  PlaybookExecuteRequest,
  PlaybookExecuteResponse,
  PlaybookListItem,
  PlaybookMetricsSummary,
  PlaybookPreviewRequest,
  PlaybookPreviewResponse,
  ResponseActivityDTO,
  ResponseActivityListParams,
  ResponseActivityPageResult,
  ResponseActivityStatus,
  ResponseActivitySummary,
  ResponseExecutionTraceResult,
  ResponseApprovalDecisionRequest,
  ResponseApprovalListParams,
  ResponseApprovalRequest,
  ResponseAuthorityDelegate,
  ResponseAuthorityDelegateSaveRequest,
  ResponseAuthorityPolicy,
  ResponseAuthorityPolicySaveRequest,
  ResponseGovernanceResult,
  PlaybookListParams,
  TriggerType,
} from './response.types';

import { apiClient } from '@/lib/apiClient';
import { fetchEventSource, type FetchEventSourceHandle, type SseMessage } from '@/lib/fetchEventSource';
import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';
/** True only during DEV fixture builds. Never leaks to production. */
export const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const UNAVAILABLE_GOVERNANCE =
  'Response governance APIs are not available from the backend yet';

interface CanonicalPlaybookListDTO {
  id: number | string;
  name?: string | null;
  description?: string | null;
  triggerType?: string | null;
  active?: boolean | null;
  status?: string | null;
  runCount?: number | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  approvalRequired?: boolean | null;
  category?: string | null;
  createdBy?: string | null;
  updatedAt?: string | null;
  steps?: Array<{
    stepType?: string | null;
    label?: string | null;
    config?: Record<string, unknown> | null;
  }> | null;
}

const PLAYBOOK_CATEGORIES = new Set<PlaybookListItem['category']>([
  'EDR',
  'Identity',
  'Network',
  'Cloud',
  'Ticketing',
  'Notification',
  'Enrichment',
  'Multi-step',
]);

function inferCompatibilityCategory(dto: CanonicalPlaybookListDTO): PlaybookListItem['category'] {
  if (dto.category && PLAYBOOK_CATEGORIES.has(dto.category as PlaybookListItem['category'])) {
    return dto.category as PlaybookListItem['category'];
  }

  // Compatibility fallback for the current compact DTO. The canonical bounded
  // list projection must eventually provide category explicitly (RESP-013).
  const searchable = [
    dto.name,
    dto.description,
    ...(dto.steps ?? []).flatMap((step) => [step.stepType, step.label]),
  ].filter(Boolean).join(' ').toLowerCase();

  if (/identity|account|credential|password|user/.test(searchable)) return 'Identity';
  if (/network|dns|firewall|sinkhole|\bip\b/.test(searchable)) return 'Network';
  if (/cloud|aws|azure|gcp/.test(searchable)) return 'Cloud';
  if (/ticket|servicenow|jira/.test(searchable)) return 'Ticketing';
  if (/notify|notification|slack|email|teams/.test(searchable)) return 'Notification';
  if (/enrich|reputation|lookup|intel/.test(searchable)) return 'Enrichment';
  if (/endpoint|host|process|isolate|quarantine|edr/.test(searchable)) return 'EDR';
  return 'Multi-step';
}

/**
 * Normalizes the secured backend DTO into the compact library projection.
 * This is intentionally defensive while RESP-013 remains partial: production
 * must never render undefined semantic states when the older DTO omits fields.
 */
export function adaptCanonicalPlaybookListItem(
  dto: CanonicalPlaybookListDTO
): PlaybookListItem {
  const trigger = dto.triggerType?.toLowerCase();
  const triggerType: PlaybookListItem['triggerType'] =
    trigger === 'alert-triggered' || trigger === 'automatic'
      ? 'AUTOMATIC'
      : trigger === 'scheduled'
        ? 'SCHEDULED'
        : 'MANUAL';
  const explicitStatus = dto.status?.toUpperCase();
  const status: PlaybookListItem['status'] = explicitStatus === 'DRAFT'
    ? 'DRAFT'
    : explicitStatus === 'ACTIVE' || dto.active === true
      ? 'ACTIVE'
      : 'INACTIVE';
  const lastRunStatus = dto.lastRunStatus?.toLowerCase();
  const normalizedLastRunStatus: PlaybookListItem['lastRunStatus'] =
    lastRunStatus === 'success' || lastRunStatus === 'failure' ||
    lastRunStatus === 'running' || lastRunStatus === 'cancelled' ||
    lastRunStatus === 'awaiting_approval'
      ? lastRunStatus
      : null;
  const approvalRequired = dto.approvalRequired === true || (dto.steps ?? []).some(
    (step) => step.config?.approvalRequired === true || step.stepType?.toLowerCase() === 'approval'
  );

  return {
    id: String(dto.id),
    name: dto.name?.trim() || `Playbook ${String(dto.id)}`,
    description: dto.description?.trim() || 'No description provided.',
    status,
    triggerType,
    category: inferCompatibilityCategory(dto),
    runCount: Number.isFinite(dto.runCount) ? Math.max(0, dto.runCount ?? 0) : 0,
    lastRunAt: dto.lastRunAt ?? null,
    lastRunStatus: normalizedLastRunStatus,
    approvalRequired,
    createdBy: dto.createdBy?.trim() || 'Not provided',
    updatedAt: dto.updatedAt ?? dto.lastRunAt ?? '',
  };
}

// ─── RESP-001: Playbook list (cursor pagination) ───────────────────────────

export async function fetchPlaybookList(
  params: PlaybookListParams & { search?: string; cursor?: string; category?: string }
): Promise<CursorPageResult<PlaybookListItem>> {
  if (fixtureMode) {
    const { filterFoundationPlaybooks } = await import('@/pages/response/response.fixtures');
    return filterFoundationPlaybooks(params);
  }
  // Real backend returns X-Total-Count; wrap into cursor envelope client-side
  const token = localStorage.getItem(TOKEN_KEY);
  const selectedTenantId = useAuthStore.getState().selectedTenantId;
  const qs = new URLSearchParams();
  if (params.size !== undefined) qs.set('size', String(params.size ?? 25));
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.status && params.status !== 'ALL') qs.set('status', params.status);
  if (params.triggerType && params.triggerType !== 'ALL') qs.set('triggerType', params.triggerType);
  if (params.search) qs.set('search', params.search);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (selectedTenantId !== null) headers['X-Tenant-ID'] = String(selectedTenantId);
  const res = await fetch(`/api/ha-playbooks?${qs.toString()}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rawItems = (await res.json()) as CanonicalPlaybookListDTO[];
  const normalizedItems = rawItems.map(adaptCanonicalPlaybookListItem);
  const searchTerm = params.search?.trim().toLowerCase();
  const filteredItems = normalizedItems.filter((item) => {
    if (params.status && params.status !== 'ALL' && item.status !== params.status) return false;
    if (params.triggerType && params.triggerType !== 'ALL' && item.triggerType !== params.triggerType) return false;
    if (params.category && params.category !== 'ALL' && item.category !== params.category) return false;
    if (searchTerm && !`${item.name} ${item.description}`.toLowerCase().includes(searchTerm)) return false;
    return true;
  });
  const size = Math.min(Math.max(params.size ?? 25, 1), 100);
  const offset = params.cursor?.startsWith('client:')
    ? Math.max(0, Number.parseInt(params.cursor.slice(7), 10) || 0)
    : 0;
  const items = filteredItems.slice(offset, offset + size);
  const total = filteredItems.length;
  const nextOffset = offset + items.length;
  const serverCursor = res.headers.get('X-Next-Cursor');
  const nextCursor = serverCursor ?? (nextOffset < total ? `client:${nextOffset}` : null);
  return {
    items,
    total,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

// ─── Playbook metrics summary ──────────────────────────────────────────────

export async function fetchPlaybookMetrics(): Promise<PlaybookMetricsSummary> {
  if (fixtureMode) {
    const { foundationPlaybookMetrics } = await import('@/pages/response/response.fixtures');
    return foundationPlaybookMetrics;
  }
  try {
    return await apiClient.get<PlaybookMetricsSummary>('/ha-playbooks/metrics');
  } catch {
    // Metrics are non-critical — keep the library usable if the strip endpoint lags.
    return {
      total: 0,
      active: 0,
      executionsLast24h: 0,
      successRate24h: 0,
      pendingApprovals: 0,
      activeQuarantines: 0,
      snapshotAt: new Date().toISOString(),
    };
  }
}

// ─── RESP-002: Execution preview (dry-run) ────────────────────────────────

export async function previewPlaybookExecution(
  request: PlaybookPreviewRequest
): Promise<PlaybookPreviewResponse> {
  if (fixtureMode) {
    const { foundationPreviewPlaybookExecution } = await import('@/pages/response/response.fixtures');
    return foundationPreviewPlaybookExecution(request.playbookId);
  }
  const body: Record<string, unknown> = {
    alertId: request.triggerContext?.entityType === 'ALERT' ? request.triggerContext.entityId : undefined,
    inputs: request.inputs ?? {},
  };
  return apiClient.post<PlaybookPreviewResponse>(
    `/ha-playbooks/${request.playbookId}/preview`,
    body
  );
}

// ─── RESP-003: Execute playbook ────────────────────────────────────────────

export async function executePlaybookConfirmed(
  request: PlaybookExecuteRequest
): Promise<PlaybookExecuteResponse> {
  const body: Record<string, unknown> = {
    previewToken: request.previewToken,
    alertId:
      request.triggerContext?.entityType === 'ALERT' ? request.triggerContext.entityId : undefined,
    agentId:
      typeof request.inputs?.agentId === 'string' ? request.inputs.agentId : undefined,
    hostname:
      typeof request.inputs?.hostname === 'string' ? request.inputs.hostname : undefined,
    inputs: request.inputs ?? {},
  };
  return apiClient.post<PlaybookExecuteResponse>(
    `/ha-playbooks/${request.playbookId}/execute`,
    body
  );
}

// ─── RESP-004: Approve / reject (execution-scoped; STAGING CANDIDATE) ──────
// POST /api/ha-playbooks/executions/{executionId}/approve|reject
// Backend requires ROLE_ADMIN. Do not log execution payloads or secrets.

export interface PlaybookApprovalDecisionResponse {
  executionId: string;
  status: string;
  approved: boolean;
  resumeFromStep?: number;
}

/** Resume a playbook paused at an approval gate. */
export async function approvePlaybookExecution(
  executionId: string
): Promise<PlaybookApprovalDecisionResponse> {
  return apiClient.post<PlaybookApprovalDecisionResponse>(
    `/ha-playbooks/executions/${encodeURIComponent(executionId)}/approve`
  );
}

/** Reject a paused approval gate; optional reason is stored on the execution. */
export async function rejectPlaybookExecution(
  executionId: string,
  reason?: string
): Promise<PlaybookApprovalDecisionResponse> {
  const body =
    reason !== undefined && reason.trim().length > 0
      ? { reason: reason.trim() }
      : undefined;
  return apiClient.post<PlaybookApprovalDecisionResponse>(
    `/ha-playbooks/executions/${encodeURIComponent(executionId)}/reject`,
    body
  );
}

/**
 * @deprecated Prefer {@link approvePlaybookExecution} / {@link rejectPlaybookExecution}.
 * Kept as a thin adapter for any callers still using the decision union.
 */
export async function approveExecution(
  executionId: string,
  decision: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
): Promise<PlaybookApprovalDecisionResponse> {
  if (decision === 'APPROVED') {
    return approvePlaybookExecution(executionId);
  }
  return rejectPlaybookExecution(executionId, rejectionReason);
}

// ─── RESP-020: Response governance and human approval queue ───────────────
// Full governance (policies/delegations) stays fail-closed via RESP_020_GOVERNANCE.
// Approval queue may use RESP_020_APPROVAL_PROJECTION over playbook executions.

export async function fetchResponseGovernance(
  params: ResponseApprovalListParams
): Promise<ResponseGovernanceResult> {
  if (fixtureMode) {
    const { getFoundationResponseGovernance } = await import('@/pages/response/response.fixtures');
    return getFoundationResponseGovernance(params);
  }
  if (!RESP_020_GOVERNANCE && !RESP_020_APPROVAL_PROJECTION) {
    const snapshotAt = new Date().toISOString();
    return {
      approvals: [],
      policies: [],
      delegates: [],
      summary: {
        pending: 0,
        dueSoon: 0,
        critical: 0,
        restrictedWindow: 0,
        approved24h: 0,
        rejected24h: 0,
        medianDecisionMs: 0,
        connectorWarnings: 0,
        snapshotAt,
      },
      snapshotAt,
      stale: false,
      partialFailures: [UNAVAILABLE_GOVERNANCE],
    };
  }
  const query = new URLSearchParams();
  if (params.state && params.state !== 'ALL') query.set('state', params.state);
  if (params.risk && params.risk !== 'ALL') query.set('risk', params.risk);
  if (params.tenantScope) query.set('tenantScope', params.tenantScope);
  if (params.search) query.set('search', params.search);
  query.set('limit', String(params.limit ?? 100));
  return apiClient.get<ResponseGovernanceResult>(`/ha-response-governance/approvals?${query.toString()}`);
}

export async function decideResponseGovernanceApproval(
  request: ResponseApprovalDecisionRequest
): Promise<ResponseApprovalRequest> {
  if (fixtureMode) {
    const { decideFoundationResponseApproval } = await import('@/pages/response/response.fixtures');
    return decideFoundationResponseApproval(request);
  }
  if (!RESP_020_GOVERNANCE && !RESP_020_APPROVAL_PROJECTION) {
    throw new Error(UNAVAILABLE_GOVERNANCE);
  }
  // Projection / full governance decision path — BE bridges to playbook approve|reject.
  // Preserve ADMIN-only auth on the backend; do not invent a softer FE bypass.
  return apiClient.post<ResponseApprovalRequest>(
    `/ha-response-governance/approvals/${encodeURIComponent(request.approvalId)}/decision`,
    request
  );
}

export async function saveResponseAuthorityPolicy(
  request: ResponseAuthorityPolicySaveRequest
): Promise<ResponseAuthorityPolicy> {
  if (fixtureMode) {
    const { saveFoundationResponseAuthorityPolicy } = await import('@/pages/response/response.fixtures');
    return saveFoundationResponseAuthorityPolicy(request);
  }
  // Fail-closed: policy CRUD requires full RESP_020_GOVERNANCE — projection does not unlock it.
  if (!RESP_020_GOVERNANCE) {
    throw new Error(UNAVAILABLE_GOVERNANCE);
  }
  const path = request.id
    ? `/ha-response-governance/policies/${request.id}`
    : '/ha-response-governance/policies';
  return request.id
    ? apiClient.put<ResponseAuthorityPolicy>(path, request)
    : apiClient.post<ResponseAuthorityPolicy>(path, request);
}

export async function saveResponseAuthorityDelegate(
  request: ResponseAuthorityDelegateSaveRequest
): Promise<ResponseAuthorityDelegate> {
  if (fixtureMode) {
    const { saveFoundationResponseAuthorityDelegate } = await import('@/pages/response/response.fixtures');
    return saveFoundationResponseAuthorityDelegate(request);
  }
  // Fail-closed: delegation CRUD requires full RESP_020_GOVERNANCE.
  if (!RESP_020_GOVERNANCE) {
    throw new Error(UNAVAILABLE_GOVERNANCE);
  }
  const path = request.id
    ? `/ha-response-governance/delegations/${request.id}`
    : '/ha-response-governance/delegations';
  return request.id
    ? apiClient.put<ResponseAuthorityDelegate>(path, request)
    : apiClient.post<ResponseAuthorityDelegate>(path, request);
}

// ─── RESP-005: Cancel execution ────────────────────────────────────────────

export async function cancelExecution(executionId: string): Promise<void> {
  if (fixtureMode) return Promise.resolve();
  return apiClient.delete<void>(`/ha-playbooks/${executionId}`);
}

// ─── RESP-006: SSE stream ──────────────────────────────────────────────────
/**
 * Opens a server-sent-event stream for execution step updates.
 * B0-5c: authenticates via the Authorization header (fetch-based SSE), never the URL query string.
 * @param onMessage receives each parsed SSE message ({ event, data, id }).
 * @returns a handle; caller must call close() when done.
 */
export function openExecutionStream(
  executionId: string,
  onMessage: (message: SseMessage) => void,
): FetchEventSourceHandle {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const url = `/api/ha-playbooks/${encodeURIComponent(executionId)}/stream`;
  return fetchEventSource(url, { token, onMessage });
}

// ─── RESP-018: Response activity and progressive execution trace ─────────

/** Backend SOAR audit row (UtmPlaybookExecutionDTO). */
interface SoarAuditExecutionDTO {
  id: number;
  playbookId: number;
  playbookName: string;
  status: string;
  triggerType: string;
  triggeredBy: string;
  alertId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  totalSteps?: number | null;
  completedSteps?: number | null;
  errorMessage?: string | null;
  stepsLog?: string | null;
}

function mapSoarStatus(raw: string | undefined): ResponseActivityStatus {
  const normalized = (raw ?? '').trim().toUpperCase();
  if (normalized === 'SUCCESS' || normalized === 'COMPLETED') return 'SUCCESS';
  if (normalized === 'FAILED' || normalized === 'FAILURE' || normalized === 'ERROR') return 'FAILED';
  if (normalized === 'PARTIAL' || normalized === 'PARTIAL_SUCCESS') return 'PARTIAL';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') return 'CANCELLED';
  if (normalized === 'BLOCKED') return 'BLOCKED';
  if (normalized === 'AWAITING_APPROVAL' || normalized === 'PENDING_APPROVAL') return 'AWAITING_APPROVAL';
  if (normalized === 'QUEUED') return 'QUEUED';
  if (normalized === 'RUNNING' || normalized === 'IN_PROGRESS') return 'RUNNING';
  return 'RUNNING';
}

function mapSoarTrigger(raw: string | undefined): TriggerType {
  const normalized = (raw ?? '').trim().toUpperCase();
  if (normalized.includes('SCHEDUL')) return 'SCHEDULED';
  if (normalized.includes('MANUAL') || normalized === 'USER') return 'MANUAL';
  return 'AUTOMATIC';
}

function mapSoarAuditRow(row: SoarAuditExecutionDTO): ResponseActivityDTO {
  const startedAt = row.startedAt ?? undefined;
  const completedAt = row.endedAt ?? undefined;
  let durationMs: number | undefined;
  if (startedAt && completedAt) {
    const ms = Date.parse(completedAt) - Date.parse(startedAt);
    if (Number.isFinite(ms) && ms >= 0) durationMs = ms;
  }
  const stepCount =
    typeof row.totalSteps === 'number' && Number.isFinite(row.totalSteps)
      ? Math.max(0, row.totalSteps)
      : undefined;
  return {
    id: String(row.id),
    timestamp: startedAt ?? new Date(0).toISOString(),
    playbookName: row.playbookName?.trim() || `Playbook ${row.playbookId}`,
    playbookId: String(row.playbookId),
    trigger: mapSoarTrigger(row.triggerType),
    linkedEntityId: row.alertId?.trim() || undefined,
    linkedEntityType: row.alertId?.trim() ? 'ALERT' : undefined,
    executedBy: row.triggeredBy?.trim() || 'system',
    status: mapSoarStatus(row.status),
    durationMs,
    startedAt,
    completedAt,
    stepCount,
    rawLog: row.errorMessage?.trim() || row.stepsLog?.trim() || undefined,
    capabilities: {
      canCancel: false,
      canRetry: false,
      canViewInputs: false,
      canViewOutputs: false,
    },
    steps: [],
  };
}

function summarizeActivityItems(
  items: ResponseActivityDTO[],
  total: number,
  snapshotAt: string,
  partialFailures: string[]
): ResponseActivitySummary {
  const running = items.filter((item) => item.status === 'RUNNING' || item.status === 'QUEUED').length;
  const awaitingApproval = items.filter((item) => item.status === 'AWAITING_APPROVAL').length;
  const failed = items.filter((item) => item.status === 'FAILED').length;
  const partial = items.filter((item) => item.status === 'PARTIAL').length;
  const success = items.filter((item) => item.status === 'SUCCESS').length;
  const completed = success + failed + partial;
  const durations = items
    .map((item) => item.durationMs)
    .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms))
    .sort((a, b) => a - b);
  const medianDurationMs =
    durations.length === 0
      ? 0
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2);
  return {
    total,
    running,
    awaitingApproval,
    failed,
    partial,
    successRate: completed === 0 ? 0 : Math.round((success / completed) * 100),
    medianDurationMs,
    degradedConnectors: 0,
    snapshotAt,
    totalIsExact: true,
    partialFailures,
  };
}

/**
 * Offset-page cursor for SOAR audit (Spring Pageable). Encoded as `soar:{page}`.
 */
function parseSoarAuditPage(cursor: string | undefined): number {
  if (!cursor?.startsWith('soar:')) return 0;
  const page = Number.parseInt(cursor.slice(5), 10);
  return Number.isFinite(page) && page >= 0 ? page : 0;
}

async function fetchSoarAuditActivity(
  params: ResponseActivityListParams & { search?: string },
  signal?: AbortSignal
): Promise<ResponseActivityPageResult> {
  const snapshotAt = new Date().toISOString();
  const size = Math.min(Math.max(params.size ?? 100, 1), 100);
  const page = parseSoarAuditPage(params.cursor);
  const token = localStorage.getItem(TOKEN_KEY);
  const selectedTenantId = useAuthStore.getState().selectedTenantId;
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('size', String(size));
  qs.set('sort', 'startedAt,desc');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (selectedTenantId !== null) headers['X-Tenant-ID'] = String(selectedTenantId);

  const res = await fetch(`/api/soar/audit?${qs.toString()}`, { headers, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rawItems = (await res.json()) as SoarAuditExecutionDTO[];
  const totalHeader = parseInt(res.headers.get('X-Total-Count') ?? String(rawItems.length), 10);
  const total = Number.isFinite(totalHeader) ? totalHeader : rawItems.length;

  let items = rawItems.map(mapSoarAuditRow);
  const searchTerm = params.search?.trim().toLowerCase();
  const clientFilters: string[] = [];
  if (params.status && params.status !== 'ALL') {
    items = items.filter((item) => item.status === params.status);
    clientFilters.push('status');
  }
  if (params.trigger && params.trigger !== 'ALL') {
    items = items.filter((item) => item.trigger === params.trigger);
    clientFilters.push('trigger');
  }
  if (params.triggeredBy) {
    const by = params.triggeredBy.trim().toLowerCase();
    items = items.filter((item) => item.executedBy.toLowerCase().includes(by));
    clientFilters.push('triggeredBy');
  }
  if (searchTerm) {
    items = items.filter((item) =>
      `${item.playbookName} ${item.id} ${item.linkedEntityId ?? ''} ${item.executedBy}`
        .toLowerCase()
        .includes(searchTerm)
    );
    clientFilters.push('search');
  }
  if (params.timeFrom) {
    const fromMs = Date.parse(params.timeFrom);
    if (Number.isFinite(fromMs)) {
      items = items.filter((item) => Date.parse(item.timestamp) >= fromMs);
      clientFilters.push('timeFrom');
    }
  }
  if (params.timeTo) {
    const toMs = Date.parse(params.timeTo);
    if (Number.isFinite(toMs)) {
      items = items.filter((item) => Date.parse(item.timestamp) <= toMs);
      clientFilters.push('timeTo');
    }
  }

  const partialFailures = [RESP_018_SOAR_AUDIT_TITLE];
  if (clientFilters.length > 0) {
    partialFailures.push(
      `Client-side filters (${clientFilters.join(', ')}) apply to the current SOAR audit page only`
    );
  }

  const hasMore = (page + 1) * size < total;
  const nextCursor = hasMore ? `soar:${page + 1}` : null;
  const previousCursor = page > 0 ? `soar:${page - 1}` : null;

  return {
    items,
    nextCursor,
    total: clientFilters.length > 0 ? items.length : total,
    hasMore,
    previousCursor,
    snapshotAt,
    stale: false,
    summary: summarizeActivityItems(
      items,
      clientFilters.length > 0 ? items.length : total,
      snapshotAt,
      partialFailures
    ),
  };
}

export async function fetchResponseActivity(
  params: ResponseActivityListParams & { search?: string },
  signal?: AbortSignal
): Promise<ResponseActivityPageResult> {
  if (fixtureMode) {
    const { filterFoundationResponseActivity } = await import('@/pages/response/response.fixtures');
    return filterFoundationResponseActivity(params);
  }
  if (RESP_018_EXECUTION_INVENTORY) {
    const query = {
      search: params.search,
      status: params.status && params.status !== 'ALL' ? params.status : undefined,
      trigger: params.trigger && params.trigger !== 'ALL' ? params.trigger : undefined,
      playbookId: params.playbookId,
      triggeredBy: params.triggeredBy,
      actionType: params.actionType,
      tenantScope: params.tenantScope ?? 'authorized',
      from: params.timeFrom,
      to: params.timeTo,
      cursor: params.cursor,
      limit: params.size ?? 100,
    };
    const summaryQuery = {
      search: query.search,
      status: query.status,
      trigger: query.trigger,
      playbookId: query.playbookId,
      triggeredBy: query.triggeredBy,
      actionType: query.actionType,
      tenantScope: query.tenantScope,
      from: query.from,
      to: query.to,
    };
    const [page, summary] = await Promise.all([
      apiClient.get<Omit<ResponseActivityPageResult, 'summary'>>('/ha-playbooks/executions', {
        params: query,
        signal,
      }),
      apiClient.get<ResponseActivitySummary>('/ha-playbooks/executions/summary', {
        params: summaryQuery,
        signal,
      }),
    ]);
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, steps: item.steps ?? [] })),
      summary,
    };
  }
  if (RESP_018_SOAR_AUDIT_PROJECTION) {
    return fetchSoarAuditActivity(params, signal);
  }
  const snapshotAt = new Date().toISOString();
  const summary: ResponseActivitySummary = {
    total: 0,
    running: 0,
    awaitingApproval: 0,
    failed: 0,
    partial: 0,
    successRate: 0,
    medianDurationMs: 0,
    degradedConnectors: 0,
    snapshotAt,
    totalIsExact: true,
    partialFailures: ['Playbook execution inventory is not available from the backend yet'],
  };
  return {
    items: [],
    nextCursor: null,
    total: 0,
    hasMore: false,
    previousCursor: null,
    snapshotAt,
    stale: false,
    summary,
  };
}

export async function fetchResponseExecutionTrace(
  executionId: string,
  cursor?: string,
  signal?: AbortSignal
): Promise<ResponseExecutionTraceResult> {
  if (fixtureMode) {
    const { getFoundationResponseExecutionTrace } = await import('@/pages/response/response.fixtures');
    return getFoundationResponseExecutionTrace(executionId);
  }
  if (!RESP_018_EXECUTION_INVENTORY) {
    return {
      items: [],
      nextCursor: null,
      total: 0,
      hasMore: false,
      snapshotAt: new Date().toISOString(),
      stale: false,
      partialFailures: [
        RESP_018_SOAR_AUDIT_PROJECTION
          ? 'Progressive execution trace requires RESP-018 inventory; SOAR audit projection has no step trace'
          : 'Playbook execution trace is not available from the backend yet',
      ],
    };
  }
  return apiClient.get<ResponseExecutionTraceResult>(`/ha-playbooks/executions/${encodeURIComponent(executionId)}/trace`, {
    params: { cursor, limit: 100 },
    signal,
  });
}

// Quarantine list/release and legacy action-catalog helpers removed (A3-QUAR-03 / A3-LIB-02).
// File quarantine uses edr services; library uses GET /api/response/actions.

// ─── Activation toggle ─────────────────────────────────────────────────────
export async function setPlaybookActive(playbookId: string, active: boolean): Promise<void> {
  const id = Number(playbookId);
  if (!Number.isFinite(id)) throw new Error(`Invalid playbook id: ${playbookId}`);
  return apiClient.patch<void>(`/ha-playbooks/${id}/status`, undefined, {
    params: { active },
  });
}

/**
 * Seeds the three starter playbooks into the live library (idempotent by name).
 * Used from the empty-state CTA — skips templates whose names already exist.
 */
export async function seedStarterPlaybooks(): Promise<{ created: number; skipped: number }> {
  const { STARTER_PLAYBOOK_TEMPLATES } = await import(
    '@/pages/response/playbookStarterTemplates'
  );
  const existing = await fetchPlaybookList({ size: 100 });
  const names = new Set(existing.items.map((p) => p.name.toLowerCase()));
  let created = 0;
  let skipped = 0;
  for (const template of STARTER_PLAYBOOK_TEMPLATES) {
    if (names.has(template.name.toLowerCase())) {
      skipped += 1;
      continue;
    }
    await apiClient.post('/ha-playbooks', {
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      active: template.active,
      steps: template.steps,
    });
    created += 1;
  }
  return { created, skipped };
}
