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
  PlaybookListParams,
} from './response.types';

import { apiClient } from '@/lib/apiClient';
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

export async function fetchResponseGovernance(
  params: ResponseApprovalListParams
): Promise<ResponseGovernanceResult> {
  if (fixtureMode) {
    const { getFoundationResponseGovernance } = await import('@/pages/response/response.fixtures');
    return getFoundationResponseGovernance(params);
  }
  if (!RESP_020_GOVERNANCE) {
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
  if (!RESP_020_GOVERNANCE) {
    throw new Error(UNAVAILABLE_GOVERNANCE);
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
  if (!RESP_018_EXECUTION_INVENTORY) {
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
      partialFailures: [
        'Playbook execution inventory is not available from the backend yet',
      ],
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
  if (!RESP_018_EXECUTION_INVENTORY) {
    return {
      items: [],
      nextCursor: null,
      total: 0,
      hasMore: false,
      snapshotAt: new Date().toISOString(),
      stale: false,
      partialFailures: [
        'Playbook execution trace is not available from the backend yet',
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
