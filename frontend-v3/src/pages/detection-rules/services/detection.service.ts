/**
 * Detection Rules Service — Sprint 47
 * All 24 API endpoints for DET-008 through DET-016 contracts
 */

import type {
  ApproveRejectRequest,
  BulkDeleteRequest,
  BulkDeleteResult,
  BulkDuplicateRequest,
  BulkDuplicateResult,
  BulkExportRequest,
  BulkExportResponse,
  BulkResult,
  BulkStatusRequest,
  CoverageMatrix,
  CreateRuleRequest,
  DetectionRule,
  ExecutionListParams,
  ExecutionListResponse,
  GapFillRequest,
  GapFillResponse,
  ImportExecuteRequest,
  ImportExecuteResult,
  ImportPreviewResponse,
  ImportValidateResponse,
  ManagedUpdatesApplyResponse,
  ManagedUpdatesCheckResponse,
  ManualRunRequest,
  ManualRunResponse,
  PreviewRequest,
  PreviewResult,
  RevertRequest,
  RuleDefinition,
  RuleDetailResponse,
  RuleInventoryParams,
  RuleInventoryResponse,
  SubmitReviewResponse,
  UpdateRuleRequest,
  ValidationResult,
} from '../types/detection.types';

const TOKEN_KEY = 'hivearmor_auth_token';
const BASE = '/api/ha-detection-rules';

function getHeaders(contentType?: string): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ── DET-008: Rule Inventory ──────────────────────────────────────────────────

/** GET /ha-detection-rules — Bounded rule inventory with health and facets */
export async function fetchRuleInventory(
  params: RuleInventoryParams,
  signal?: AbortSignal
): Promise<RuleInventoryResponse> {
  const query = new URLSearchParams();
  if (params.scope) query.set('scope', params.scope);
  if (params.status) query.set('status', params.status);
  if (params.severity) query.set('severity', params.severity);
  if (params.tactics) query.set('tactics', params.tactics);
  if (params.q) query.set('q', params.q);
  if (params.sort) query.set('sort', params.sort);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));

  const url = `${BASE}?${query.toString()}`;
  const response = await fetch(url, { signal, headers: getHeaders() });
  return handleResponse<RuleInventoryResponse>(response);
}

// ── DET-009: Execution Monitoring ────────────────────────────────────────────

/** GET /ha-detection-rules/executions — Execution history */
export async function fetchExecutions(
  params: ExecutionListParams,
  signal?: AbortSignal
): Promise<ExecutionListResponse> {
  const query = new URLSearchParams();
  if (params.ruleId) query.set('ruleId', params.ruleId);
  if (params.status) query.set('status', params.status);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));

  const url = `${BASE}/executions?${query.toString()}`;
  const response = await fetch(url, { signal, headers: getHeaders() });
  return handleResponse<ExecutionListResponse>(response);
}

/** POST /ha-detection-rules/{id}/manual-run — Trigger manual execution */
export async function triggerManualRun(
  ruleId: string,
  body: ManualRunRequest
): Promise<ManualRunResponse> {
  const response = await fetch(`${BASE}/${ruleId}/manual-run`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<ManualRunResponse>(response);
}

/** POST /ha-detection-rules/{id}/gap-fill — Fill execution gaps */
export async function triggerGapFill(
  ruleId: string,
  body: GapFillRequest
): Promise<GapFillResponse> {
  const response = await fetch(`${BASE}/${ruleId}/gap-fill`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<GapFillResponse>(response);
}

// ── DET-010: Bulk Operations ─────────────────────────────────────────────────

/** POST /ha-detection-rules/bulk/status — Bulk enable/disable */
export async function bulkStatus(body: BulkStatusRequest): Promise<BulkResult> {
  const response = await fetch(`${BASE}/bulk/status`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<BulkResult>(response);
}

/** POST /ha-detection-rules/bulk/export — Bulk export rules */
export async function bulkExport(body: BulkExportRequest): Promise<BulkExportResponse> {
  const response = await fetch(`${BASE}/bulk/export`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<BulkExportResponse>(response);
}

/** POST /ha-detection-rules/bulk/duplicate — Bulk duplicate */
export async function bulkDuplicate(body: BulkDuplicateRequest): Promise<BulkDuplicateResult> {
  const response = await fetch(`${BASE}/bulk/duplicate`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<BulkDuplicateResult>(response);
}

/** POST /ha-detection-rules/bulk/delete — Bulk delete (custom only) */
export async function bulkDelete(body: BulkDeleteRequest): Promise<BulkDeleteResult> {
  const response = await fetch(`${BASE}/bulk/delete`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<BulkDeleteResult>(response);
}

// ── DET-011: Validation and Preview ──────────────────────────────────────────

/** POST /ha-detection-rules/validate — Validate rule definition */
export async function validateRule(rule: RuleDefinition): Promise<ValidationResult> {
  const response = await fetch(`${BASE}/validate`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify({ rule }),
  });
  return handleResponse<ValidationResult>(response);
}

/** POST /ha-detection-rules/preview — Historical preview (dry-run) */
export async function previewRule(body: PreviewRequest): Promise<PreviewResult> {
  const response = await fetch(`${BASE}/preview`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<PreviewResult>(response);
}

// ── DET-012: Sigma Import Pipeline ───────────────────────────────────────────

/** POST /ha-detection-rules/import/validate — Validate Sigma files */
export async function importValidate(files: File[]): Promise<ImportValidateResponse> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${BASE}/import/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: formData,
  });
  return handleResponse<ImportValidateResponse>(response);
}

/** POST /ha-detection-rules/import/preview — Preview conversion */
export async function importPreview(candidates: string[]): Promise<ImportPreviewResponse> {
  const response = await fetch(`${BASE}/import/preview`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify({ candidates }),
  });
  return handleResponse<ImportPreviewResponse>(response);
}

/** POST /ha-detection-rules/import/execute — Execute import */
export async function importExecute(body: ImportExecuteRequest): Promise<ImportExecuteResult> {
  const response = await fetch(`${BASE}/import/execute`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<ImportExecuteResult>(response);
}

/** POST /ha-detection-rules/managed-updates/check — Check for updates */
export async function checkManagedUpdates(): Promise<ManagedUpdatesCheckResponse> {
  const response = await fetch(`${BASE}/managed-updates/check`, {
    method: 'POST',
    headers: getHeaders('application/json'),
  });
  return handleResponse<ManagedUpdatesCheckResponse>(response);
}

/** POST /ha-detection-rules/managed-updates/apply — Apply managed updates */
export async function applyManagedUpdates(ruleIds: string[]): Promise<ManagedUpdatesApplyResponse> {
  const response = await fetch(`${BASE}/managed-updates/apply`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify({ ruleIds }),
  });
  return handleResponse<ManagedUpdatesApplyResponse>(response);
}

// ── DET-013: Detection Health SSE ────────────────────────────────────────────

/** GET /ha-detection-rules/stream — SSE endpoint URL */
export const DETECTION_STREAM_URL = `${BASE}/stream`;

// ── DET-015: ATT&CK Coverage Matrix ─────────────────────────────────────────

/** GET /ha-detection-rules/coverage — Coverage matrix */
export async function fetchCoverage(
  scope?: string,
  signal?: AbortSignal
): Promise<CoverageMatrix> {
  const query = new URLSearchParams();
  if (scope) query.set('scope', scope);

  const url = `${BASE}/coverage?${query.toString()}`;
  const response = await fetch(url, { signal, headers: getHeaders() });
  return handleResponse<CoverageMatrix>(response);
}

// ── DET-016: Rule Authoring Lifecycle ────────────────────────────────────────

/** GET /ha-detection-rules/{id} — Full rule detail with versions + approvals */
export async function fetchRuleDetail(
  id: string,
  signal?: AbortSignal
): Promise<RuleDetailResponse> {
  const response = await fetch(`${BASE}/${id}`, { signal, headers: getHeaders() });
  return handleResponse<RuleDetailResponse>(response);
}

/** POST /ha-detection-rules — Create new rule (starts as draft) */
export async function createDetectionRule(body: CreateRuleRequest): Promise<DetectionRule> {
  const response = await fetch(BASE, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<DetectionRule>(response);
}

/** PATCH /ha-detection-rules/{id} — Edit rule (draft only) */
export async function updateDetectionRule(
  id: string,
  body: UpdateRuleRequest
): Promise<DetectionRule> {
  const response = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<DetectionRule>(response);
}

/** POST /ha-detection-rules/{id}/submit-review — Submit for review */
export async function submitForReview(id: string): Promise<SubmitReviewResponse> {
  const response = await fetch(`${BASE}/${id}/submit-review`, {
    method: 'POST',
    headers: getHeaders('application/json'),
  });
  return handleResponse<SubmitReviewResponse>(response);
}

/** POST /ha-detection-rules/{id}/approve — Approve and publish (SOC_MANAGER) */
export async function approveRule(
  id: string,
  body?: ApproveRejectRequest
): Promise<DetectionRule> {
  const response = await fetch(`${BASE}/${id}/approve`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body ?? {}),
  });
  return handleResponse<DetectionRule>(response);
}

/** POST /ha-detection-rules/{id}/reject — Reject with comments */
export async function rejectRule(
  id: string,
  body?: ApproveRejectRequest
): Promise<DetectionRule> {
  const response = await fetch(`${BASE}/${id}/reject`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body ?? {}),
  });
  return handleResponse<DetectionRule>(response);
}

/** POST /ha-detection-rules/{id}/revert — Revert to previous version */
export async function revertRule(
  id: string,
  body: RevertRequest
): Promise<DetectionRule> {
  const response = await fetch(`${BASE}/${id}/revert`, {
    method: 'POST',
    headers: getHeaders('application/json'),
    body: JSON.stringify(body),
  });
  return handleResponse<DetectionRule>(response);
}
