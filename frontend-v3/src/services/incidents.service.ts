/**
 * Incidents Service
 * Incident management and detail API calls.
 */

import { apiClient, type PaginatedResponse } from '@/lib/apiClient';
import type {
  AddAlertsToIncidentRequest,
  AiSummaryResponse,
  ChangeIncidentStatusRequest,
  CreateIncidentRequest,
  EntityGraph,
  EvidenceItem,
  IncidentDetailDTO,
  IncidentDTO,
  IncidentEntity,
  TimelineEvent,
  UserRef,
} from '@/types/api.types';

export interface IncidentListParams {
  page?: number;
  size?: number;
  sort?: string;
  status?: string;
  severity?: string;
  assigneeId?: number;
}

export async function getIncidents(params: IncidentListParams): Promise<PaginatedResponse<IncidentDTO>> {
  // Use fetch directly to access X-Total-Count header
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();
  if (params.page !== undefined) queryParams.set('page', String(params.page));
  if (params.size !== undefined) queryParams.set('size', String(params.size));
  if (params.sort) {
    const sortAliases: Record<string, string> = {
      createdAt: 'incidentCreatedDate',
      slaDueAt: 'slaDeadline',
    };
    const mappedSort = params.sort
      .split(',')
      .map((part) => sortAliases[part.trim()] ?? part.trim())
      .join(',');
    queryParams.set('sort', mappedSort);
  }
  if (params.status) {
    const statusMap: Record<string, string> = {
      open: 'OPEN',
      in_progress: 'IN_REVIEW',
      resolved: 'COMPLETED',
      closed: 'MERGED',
    };
    const mapped = params.status
      .split(',')
      .map((value) => statusMap[value.trim()] ?? value.trim().toUpperCase())
      .join(',');
    queryParams.set('incidentStatus.in', mapped);
  }
  if (params.severity) queryParams.set('incidentSeverity.equals', params.severity);
  if (params.assigneeId !== undefined) queryParams.set('assigneeId', String(params.assigneeId));

  const url = `/api/ha-incidents?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = await response.json();
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

export async function getIncident(id: number | string): Promise<IncidentDetailDTO> {
  return apiClient.get<IncidentDetailDTO>(`/ha-incidents/${id}`);
}

export async function createIncident(req: CreateIncidentRequest): Promise<IncidentDTO> {
  return apiClient.post<IncidentDTO>('/ha-incidents', req);
}

export async function addAlertsToIncident(req: AddAlertsToIncidentRequest): Promise<void> {
  return apiClient.post<void>('/ha-incidents/add-alerts', req);
}

/** PUT /ha-incidents/change-status — body uses incidentStatus enum names (OPEN|IN_REVIEW|COMPLETED|MERGED). */
export async function changeIncidentStatus(req: ChangeIncidentStatusRequest): Promise<void> {
  return apiClient.put<void>('/ha-incidents/change-status', req);
}

export async function getIncidentEntityGraph(id: number | string): Promise<EntityGraph> {
  return apiClient.get<EntityGraph>(`/ha-incidents/${id}/entity-graph`);
}

/**
 * GET /ha-incidents/{id}/evidence — OpenSearch evidence projection returns { items, total }.
 * Prefer fetchEvidenceItems (/evidence-items) for the JPA investigation board used by the workbench.
 */
export async function getIncidentEvidence(id: number | string): Promise<EvidenceItem[]> {
  const response = await apiClient.get<{ items?: EvidenceItem[]; total?: number } | EvidenceItem[]>(
    `/ha-incidents/${id}/evidence`
  );
  if (Array.isArray(response)) return response;
  return response.items ?? [];
}

export async function getIncidentTimeline(id: number | string): Promise<TimelineEvent[]> {
  return apiClient.get<TimelineEvent[]>(`/ha-incidents/${id}/timeline`);
}

export async function getIncidentEntities(id: number | string): Promise<IncidentEntity[]> {
  return apiClient.get<IncidentEntity[]>(`/ha-incidents/${id}/entities`);
}

export async function generateAiSummary(id: number | string): Promise<AiSummaryResponse> {
  return apiClient.post<AiSummaryResponse>(`/ha-incidents/${id}/ai-summary`);
}

export async function getUsersAssigned(): Promise<UserRef[]> {
  return apiClient.get<UserRef[]>('/ha-incidents/users-assigned');
}

/** Response from GET /api/ha-incidents/sla-stats */
export interface IncidentSlaStats {
  total: number;
  breached: number;
  compliant: number;
}

function toNonNegativeInt(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Normalize sla-stats payload from the backend Map shape.
 * Derives compliant when omitted so UI never divides by inconsistent fields.
 */
export function normalizeIncidentSlaStats(raw: unknown): IncidentSlaStats {
  const record =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const total = toNonNegativeInt(record.total);
  const breached = toNonNegativeInt(record.breached);
  const compliant =
    record.compliant !== undefined && record.compliant !== null
      ? toNonNegativeInt(record.compliant)
      : Math.max(0, total - breached);
  return { total, breached, compliant };
}

/** Compliance rate 0–100, or null when no incidents are tracked. */
export function slaCompliancePercent(stats: IncidentSlaStats): number | null {
  if (stats.total <= 0) return null;
  return Math.round((stats.compliant / stats.total) * 100);
}

/** Compact subtitle for SLA summary tiles (tokens/fonts applied by caller). */
export function formatSlaStatsDetail(stats: IncidentSlaStats): string {
  const rate = slaCompliancePercent(stats);
  if (rate === null) return 'no incidents tracked';
  return `${stats.compliant.toLocaleString()} compliant · ${rate}% · ${stats.total.toLocaleString()} tracked`;
}

/**
 * GET /api/ha-incidents/sla-stats — platform SLA compliance summary.
 * Requires ROLE_ANALYST | ROLE_SOC_MANAGER | ROLE_ADMIN (and SOC_ANALYST alias).
 */
export async function getIncidentSlaStats(signal?: AbortSignal): Promise<IncidentSlaStats> {
  const raw = await apiClient.get<unknown>('/ha-incidents/sla-stats', { signal });
  return normalizeIncidentSlaStats(raw);
}
