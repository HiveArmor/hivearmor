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
 * RESP-018: Bounded execution inventory, summary, and progressive trace
 * RESP-008: List quarantine records
 * RESP-011: List action catalog entries
 */

import type {
  ActionCatalogEntry,
  ActionCatalogSummary,
  ApprovalRecord,
  CursorPageResult,
  PlaybookExecuteRequest,
  PlaybookExecuteResponse,
  PlaybookListItem,
  PlaybookMetricsSummary,
  PlaybookPreviewRequest,
  PlaybookPreviewResponse,
  QuarantineRecord,
  ResponseActivityListParams,
  ResponseActivityPageResult,
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
} from './response.types';
import type { PlaybookListParams } from './response.types';

import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';
/** True only during DEV fixture builds. Never leaks to production. */
export const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

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
  return apiClient.get<PlaybookMetricsSummary>('/ha-playbooks/metrics');
}

// ─── RESP-002: Execution preview (dry-run) ────────────────────────────────

export async function previewPlaybookExecution(
  request: PlaybookPreviewRequest
): Promise<PlaybookPreviewResponse> {
  if (fixtureMode) {
    const { foundationPreviewPlaybookExecution } = await import('@/pages/response/response.fixtures');
    return foundationPreviewPlaybookExecution(request.playbookId);
  }
  return apiClient.post<PlaybookPreviewResponse>(
    `/ha-playbooks/${request.playbookId}/preview`,
    request
  );
}

// ─── RESP-003: Execute playbook ────────────────────────────────────────────

export async function executePlaybookConfirmed(
  request: PlaybookExecuteRequest
): Promise<PlaybookExecuteResponse> {
  return apiClient.post<PlaybookExecuteResponse>(
    `/ha-playbooks/${request.playbookId}/execute`,
    request
  );
}

// ─── RESP-004: Approve / reject ────────────────────────────────────────────

export async function approveExecution(
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
): Promise<void> {
  return apiClient.post<void>(`/ha-playbooks/approvals/${approvalId}/decide`, {
    decision,
    rejectionReason: rejectionReason ?? null,
  });
}

// ─── RESP-020: Response governance and human approval queue ───────────────

export async function fetchResponseGovernance(
  params: ResponseApprovalListParams
): Promise<ResponseGovernanceResult> {
  if (fixtureMode) {
    const { getFoundationResponseGovernance } = await import('@/pages/response/response.fixtures');
    return getFoundationResponseGovernance(params);
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
  return apiClient.post<ResponseApprovalRequest>(
    `/ha-response-governance/approvals/${request.approvalId}/decision`,
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
 * EventSource cannot set Authorization headers; the backend accepts `?token=` as the auth method.
 * @returns EventSource instance — caller must close it when done.
 */
export function openExecutionStream(executionId: string): EventSource {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const url = `/api/ha-playbooks/${executionId}/stream?token=${encodeURIComponent(token)}`;
  return new EventSource(url);
}

// ─── RESP-018: Response activity and progressive execution trace ─────────

export async function fetchResponseActivity(
  params: ResponseActivityListParams & { search?: string },
  signal?: AbortSignal
): Promise<ResponseActivityPageResult> {
  if (fixtureMode) {
    const { filterFoundationResponseActivity } = await import('@/pages/response/response.fixtures');
    return filterFoundationResponseActivity(params);
  }
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
    apiClient.get<Omit<ResponseActivityPageResult, 'summary'>>('/ha-playbooks/executions', { params: query, signal }),
    apiClient.get<ResponseActivitySummary>('/ha-playbooks/executions/summary', { params: summaryQuery, signal }),
  ]);
  return {
    ...page,
    // Canonical list rows are intentionally bounded. Retain an empty compatibility
    // collection until the analyst requests the progressive trace resource.
    items: page.items.map((item) => ({ ...item, steps: item.steps ?? [] })),
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
  return apiClient.get<ResponseExecutionTraceResult>(`/ha-playbooks/executions/${encodeURIComponent(executionId)}/trace`, {
    params: { cursor, limit: 100 },
    signal,
  });
}

// ─── RESP-008: Quarantine records ──────────────────────────────────────────

export async function fetchQuarantineRecords(): Promise<QuarantineRecord[]> {
  if (fixtureMode) {
    const { foundationQuarantineRecords } = await import('@/pages/response/response.fixtures');
    return foundationQuarantineRecords;
  }
  return apiClient.get<QuarantineRecord[]>('/ha-playbooks/quarantine');
}

// ─── RESP-009: Release quarantine ──────────────────────────────────────────

export async function releaseQuarantine(quarantineId: string, reason: string): Promise<void> {
  return apiClient.post<void>(`/ha-playbooks/quarantine/${quarantineId}/release`, { reason });
}

// ─── RESP-010: Approval queue ──────────────────────────────────────────────

export async function fetchPendingApprovals(): Promise<ApprovalRecord[]> {
  if (fixtureMode) {
    const { foundationApprovalQueue } = await import('@/pages/response/response.fixtures');
    return foundationApprovalQueue.filter((a) => a.approvalStatus === 'PENDING');
  }
  return apiClient.get<ApprovalRecord[]>('/ha-playbooks/approvals/pending');
}

// ─── RESP-011: Action catalog ──────────────────────────────────────────────

export async function fetchActionCatalog(): Promise<ActionCatalogEntry[]> {
  if (fixtureMode) {
    const { foundationActionCatalog } = await import('@/pages/response/response.fixtures');
    return foundationActionCatalog;
  }
  return apiClient.get<ActionCatalogEntry[]>('/ha-action-catalog');
}

export async function fetchActionCatalogSummary(): Promise<ActionCatalogSummary> {
  if (fixtureMode) {
    const { foundationActionCatalogSummary } = await import('@/pages/response/response.fixtures');
    return foundationActionCatalogSummary;
  }
  return apiClient.get<ActionCatalogSummary>('/ha-action-catalog/summary');
}

// ─── Activation toggle ─────────────────────────────────────────────────────

export async function setPlaybookActive(playbookId: string, active: boolean): Promise<void> {
  const id = Number(playbookId);
  if (!Number.isFinite(id)) throw new Error(`Invalid playbook id: ${playbookId}`);
  return apiClient.patch<void>(`/ha-playbooks/${id}/status`, undefined, {
    params: { active },
  });
}
