/**
 * Enrollment audit ledger — GET /api/ha-agent-enrollments/audit (+ export).
 * Roles: Platform Administrator | SOC Manager (matches HaAgentEnrollmentResource).
 * Safe fields only — no enrollment secrets or connection keys.
 */

import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';

export interface EnrollmentAuditEventDTO {
  id: string;
  tenantId: number;
  eventType: string;
  actor: string;
  reason: string;
  tokenId: string;
  agentId: number;
  agentUuid: string;
  policyId: string;
  platform: string;
  credentialVersion: number;
  enrollmentVersion: number;
  occurredAt: string | null;
}

export interface EnrollmentAuditListParams {
  page?: number;
  size?: number;
  tokenId?: string;
  agentUuid?: string;
  eventType?: string;
}

export interface EnrollmentAuditPageResult {
  items: EnrollmentAuditEventDTO[];
  total: number;
}

function authHeaders(accept = 'application/json'): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  const tenantId = useAuthStore.getState().selectedTenantId;
  return {
    Accept: accept,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId !== null ? { 'X-Tenant-ID': String(tenantId) } : {}),
  };
}

export async function listEnrollmentAudit(
  params: EnrollmentAuditListParams = {},
  signal?: AbortSignal
): Promise<EnrollmentAuditPageResult> {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 0));
  qs.set('size', String(params.size ?? 25));
  if (params.tokenId?.trim()) qs.set('tokenId', params.tokenId.trim());
  if (params.agentUuid?.trim()) qs.set('agentUuid', params.agentUuid.trim());
  if (params.eventType?.trim()) qs.set('eventType', params.eventType.trim());

  const response = await fetch(`/api/ha-agent-enrollments/audit?${qs.toString()}`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Enrollment audit failed (HTTP ${String(response.status)})`);
  }
  const items = (await response.json()) as EnrollmentAuditEventDTO[];
  const total = parseInt(response.headers.get('X-Total-Count') ?? String(items.length), 10);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

export async function downloadEnrollmentAuditExport(
  params: Omit<EnrollmentAuditListParams, 'page' | 'size'> = {}
): Promise<void> {
  const qs = new URLSearchParams();
  if (params.tokenId?.trim()) qs.set('tokenId', params.tokenId.trim());
  if (params.agentUuid?.trim()) qs.set('agentUuid', params.agentUuid.trim());
  if (params.eventType?.trim()) qs.set('eventType', params.eventType.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  const response = await fetch(`/api/ha-agent-enrollments/audit/export${suffix}`, {
    method: 'GET',
    headers: authHeaders('application/x-ndjson'),
  });
  if (!response.ok) {
    throw new Error(`Enrollment audit export failed (HTTP ${String(response.status)})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? 'enrollment-audit.ndjson';
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
