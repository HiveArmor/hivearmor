/**
 * Alerts Service
 * Alert management API calls (status updates, notes, tagging, conversion).
 */

import type { AlertStatus } from '@/constants/status.constants';
import { apiClient } from '@/lib/apiClient';
import { numericToSeverityLevel } from '@/lib/severity';
import type { QueueItem, WorkItemType } from '@/types/alert.types';
import type {
  AlertNotesRequest,
  AlertStatusUpdateRequest,
  AlertTagsRequest,
  ConvertToIncidentRequest,
  IncidentDTO,
  OpenAlertCountResponse,
} from '@/types/api.types';

// ── Queue list ────────────────────────────────────────────────────────────────

export interface AlertListParams {
  page: number;
  size: number;
  sort?: string;       // e.g. "severity,desc"
  severity?: string[];
  status?: string[];
  type?: string[];
  assigneeId?: number;
  tenantId?: number;
  dateFrom?: string;   // ISO 8601
  dateTo?: string;     // ISO 8601
  search?: string;
}

export interface AlertListResponse {
  items: QueueItem[];
  total: number;
}

interface AlertQueueEnvelope {
  items?: unknown[];
  alerts?: unknown[];
  total?: number;
  totalApproximate?: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function mapQueueStatus(raw: unknown): AlertStatus {
  if (typeof raw === 'number') {
    if (raw === 3) return 'in_progress';
    if (raw === 5 || raw === 6) return 'resolved';
    if (raw === 7) return 'false_positive';
    if (raw === 1 || raw === 8) return 'suppressed';
    return 'open';
  }
  const label = asString(raw).toLowerCase().replace(/\s+/g, '_');
  if (label.includes('false')) return 'false_positive';
  if (label.includes('review') || label.includes('progress')) return 'in_progress';
  if (label.includes('complete') || label.includes('resolv') || label.includes('true')) return 'resolved';
  if (label.includes('close') || label.includes('suppress')) return 'suppressed';
  return 'open';
}

function mapQueueItem(raw: unknown): QueueItem {
  const src = asRecord(raw);
  const tenant = asRecord(src.tenant);
  const numericSeverity = typeof src.severity === 'number' ? src.severity : Number(src.severity);
  const workType = asString(src.type, 'alert');
  return {
    id: asString(src.id, asString(src.alertId)),
    severity: Number.isFinite(numericSeverity) ? numericToSeverityLevel(numericSeverity) : 'medium',
    type: (workType as WorkItemType) || 'alert',
    title: asString(src.title, asString(src.name, 'Untitled alert')),
    tenant: {
      id: typeof tenant.id === 'number' ? tenant.id : Number(tenant.id) || 1,
      name: asString(tenant.name, 'Default'),
    },
    status: mapQueueStatus(src.status ?? src.statusLabel),
    assignee: null,
    alertCount: typeof src.alertCount === 'number' ? src.alertCount : 1,
    createdAt: asString(src.createdAt, asString(src.timestamp, asString(src['@timestamp']))),
    lastActivity: asString(src.lastActivity, asString(src.updatedAt, asString(src['@timestamp']))),
    slaStatus: null,
    mitreTactic: asString(src.mitreTacticName) || undefined,
    mitreTechnique: asString(src.mitreTechniqueName) || undefined,
  };
}

/**
 * Fetch a paginated list of queue items from GET /ha-alerts.
 * Maps the live cursor envelope (`q`, `from`, `to`, `limit`, `totalApproximate`)
 * onto the analyst-queue page/size contract.
 */
export async function getAlerts(params: AlertListParams): Promise<AlertListResponse> {
  const query: Record<string, string | number | string[] | undefined> = {
    page: params.page,
    size: params.size,
    limit: params.size,
    sort: params.sort,
    q: params.search,
    from: params.dateFrom,
    to: params.dateTo,
    assigneeId: params.assigneeId,
    tenantId: params.tenantId,
  };
  if (params.severity && params.severity.length > 0) query.severity = params.severity;
  if (params.status && params.status.length > 0) query.status = params.status;
  if (params.type && params.type.length > 0) query.type = params.type;

  const payload = await apiClient.get<AlertQueueEnvelope | unknown[]>('/ha-alerts', { params: query });
  if (Array.isArray(payload)) {
    return { items: payload.map(mapQueueItem), total: payload.length };
  }
  const rows = payload.items ?? payload.alerts ?? [];
  return {
    items: rows.map(mapQueueItem),
    total: payload.total ?? payload.totalApproximate ?? rows.length,
  };
}

export async function updateAlertStatus(req: AlertStatusUpdateRequest): Promise<void> {
  return apiClient.post<void>('/ha-alerts/status', req);
}

export async function addAlertNotes(req: AlertNotesRequest): Promise<void> {
  return apiClient.post<void>('/ha-alerts/notes', req);
}

export async function updateAlertTags(req: AlertTagsRequest): Promise<void> {
  return apiClient.post<void>('/ha-alerts/tags', {
    alertIds: req.alertIds,
    tags: req.tags,
    createRule: req.createRule,
  });
}

export async function convertToIncident(req: ConvertToIncidentRequest): Promise<IncidentDTO> {
  return apiClient.post<IncidentDTO>('/ha-alerts/convert-to-incident', {
    alertIds: req.alertIds,
    incidentName: req.incidentName,
    incidentId: req.incidentId ?? 0,
    incidentSource: req.incidentSource ?? 'alert',
  });
}

export async function getOpenAlertCount(): Promise<number> {
  const response = await apiClient.get<OpenAlertCountResponse | number>('/ha-alerts/count-open-alerts');
  if (typeof response === 'number') return response;
  return response.count;
}
