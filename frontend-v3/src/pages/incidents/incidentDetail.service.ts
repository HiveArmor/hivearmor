/**
 * Incident Detail Service
 * Fetch/mutation operations for incident investigation workbench against /api/ha-incidents*.
 * Fixture-gated only at the page layer; this module always talks to live APIs.
 */

import type {
  EvidenceItem,
  IncidentDetail,
  InvestigationSession,
  TimelineEvent,
} from './incidentDetail.types';
import { updateIncidentPriority } from './incidents.service';

import type { IncidentStatus } from '@/constants/status.constants';
import type { UtmAlert } from '@/types/api.types';

interface IncidentApiRecord {
  id: number;
  incidentName: string;
  incidentDescription: string | null;
  incidentPriority?: IncidentDetail['incidentPriority'];
  incidentSeverity: number;
  incidentStatus: string;
  incidentAssignedTo: string | null;
  incidentAssignedToId?: number | null;
  incidentSolution: string | null;
  incidentCreatedDate: string;
  incidentLastUpdated?: string;
  slaDeadline: string | null;
}

/** Raw evidence row from GET/POST /evidence-items (severityHint is Integer on the backend). */
interface EvidenceItemApiRecord {
  id: number;
  incidentId: number;
  itemType: EvidenceItem['itemType'];
  title: string;
  content: string | null;
  sourceRef: string | null;
  severityHint: number | string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

const STATUS_FROM_API: Record<string, IncidentStatus> = {
  OPEN: 'open',
  IN_REVIEW: 'in_progress',
  COMPLETED: 'resolved',
  MERGED: 'closed',
};

/** Maps UI status → IncidentStatusEnum names accepted by PUT /ha-incidents/change-status. */
const STATUS_TO_API: Record<IncidentStatus, string> = {
  open: 'OPEN',
  in_progress: 'IN_REVIEW',
  resolved: 'COMPLETED',
  closed: 'MERGED',
};

const SEVERITY_HINT_FROM_API: Record<number, NonNullable<EvidenceItem['severityHint']>> = {
  1: 'low',
  2: 'low',
  3: 'low',
  4: 'medium',
  5: 'medium',
  6: 'medium',
  7: 'high',
  8: 'high',
  9: 'critical',
  10: 'critical',
};

const SEVERITY_HINT_TO_API: Record<NonNullable<EvidenceItem['severityHint']>, number> = {
  low: 3,
  medium: 5,
  high: 7,
  critical: 9,
};

function authHeaders(json = false): HeadersInit {
  const token = localStorage.getItem('hivearmor_auth_token');
  return {
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeSeverityHint(
  value: number | string | null | undefined
): EvidenceItem['severityHint'] {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    const asNumber = Number.parseInt(normalized, 10);
    if (!Number.isNaN(asNumber)) return SEVERITY_HINT_FROM_API[asNumber] ?? null;
    return null;
  }
  return SEVERITY_HINT_FROM_API[value] ?? null;
}

function normalizeEvidenceItem(record: EvidenceItemApiRecord): EvidenceItem {
  return {
    id: record.id,
    incidentId: record.incidentId,
    itemType: record.itemType,
    title: record.title,
    content: record.content ?? null,
    sourceRef: record.sourceRef ?? null,
    severityHint: normalizeSeverityHint(record.severityHint),
    createdBy: record.createdBy,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : String(record.createdAt),
  };
}

export async function fetchIncidentDetail(id: number): Promise<IncidentDetail> {
  const response = await fetch(`/api/ha-incidents/${id}`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('NOT_FOUND');
    }
    if (response.status === 403) {
      throw new Error('ACCESS_DENIED');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const record = (await response.json()) as IncidentApiRecord;
  return {
    ...record,
    incidentPriority: record.incidentPriority ?? 'P3',
    incidentStatus: STATUS_FROM_API[record.incidentStatus] ?? 'open',
    incidentAssignedToId: record.incidentAssignedToId ?? null,
    incidentLastUpdated: record.incidentLastUpdated ?? record.incidentCreatedDate,
  };
}

/**
 * Sparse update for fields that have dedicated backends.
 * - incidentStatus → PUT /ha-incidents/change-status
 * - incidentPriority → PUT /ha-incidents/{id}/priority
 * Metadata (name/description/assignee) requires PATCH /ha-incidents/{id} with If-Match via patchIncident.
 */
export async function updateIncidentDetail(
  id: number,
  data: Partial<IncidentDetail>
): Promise<void> {
  const keys = Object.keys(data).filter((key) => data[key as keyof IncidentDetail] !== undefined);
  if (keys.length === 0) return;

  if (data.incidentStatus !== undefined) {
    await changeIncidentStatus(id, data.incidentStatus);
  }

  if (data.incidentPriority !== undefined) {
    await updateIncidentPriority(id, data.incidentPriority);
  }

  const unsupported = keys.filter((key) => key !== 'incidentStatus' && key !== 'incidentPriority');
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported incident fields for updateIncidentDetail: ${unsupported.join(', ')}. ` +
        'Use patchIncident (PATCH /ha-incidents/{id} with If-Match) for title/description/assignee.'
    );
  }
}

export async function closeIncident(id: number): Promise<void> {
  return changeIncidentStatus(id, 'closed');
}

export async function changeIncidentStatus(id: number, status: IncidentStatus): Promise<void> {
  const response = await fetch('/api/ha-incidents/change-status', {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify({ id, incidentStatus: STATUS_TO_API[status] }),
  });

  if (!response.ok) {
    throw new Error(`Update incident status failed: ${response.status}`);
  }
}

export async function fetchIncidentAlerts(
  incidentId: number,
  size = 50
): Promise<{ items: UtmAlert[]; total: number }> {
  const params = new URLSearchParams({
    incidentId: String(incidentId),
    page: '0',
    size: String(size),
    sort: '@timestamp',
    order: 'desc',
  });
  const response = await fetch(`/api/ha-alerts?${params.toString()}`, {
    headers: authHeaders(),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return {
    items: (await response.json()) as UtmAlert[],
    total: Number.parseInt(response.headers.get('X-Total-Count') ?? '0', 10),
  };
}

export async function fetchIncidentTimeline(incidentId: number): Promise<TimelineEvent[]> {
  const response = await fetch(`/api/ha-incidents/${incidentId}/timeline`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as TimelineEvent[];
}

export async function fetchEvidenceItems(incidentId: number): Promise<EvidenceItem[]> {
  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const records = (await response.json()) as EvidenceItemApiRecord[];
  return records.map(normalizeEvidenceItem);
}

export async function createEvidenceItem(data: {
  incidentId: number;
  itemType: EvidenceItem['itemType'];
  title: string;
  content?: string;
  sourceRef?: string;
  severityHint?: EvidenceItem['severityHint'];
}): Promise<EvidenceItem> {
  const { incidentId, severityHint, ...rest } = data;
  const body = {
    ...rest,
    ...(severityHint
      ? { severityHint: SEVERITY_HINT_TO_API[severityHint] }
      : {}),
  };
  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Create evidence item failed: ${response.status}`);
  }

  return normalizeEvidenceItem((await response.json()) as EvidenceItemApiRecord);
}

/** PUT /api/ha-incidents/{incidentId}/evidence-items/{itemId} */
export async function updateEvidenceItem(
  incidentId: number,
  itemId: number,
  data: Partial<Pick<EvidenceItem, 'title' | 'content' | 'sourceRef' | 'severityHint' | 'itemType'>>
): Promise<EvidenceItem> {
  const body: Record<string, string | number | null> = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.content !== undefined) body.content = data.content;
  if (data.sourceRef !== undefined) body.sourceRef = data.sourceRef;
  if (data.itemType !== undefined) body.itemType = data.itemType;
  if (data.severityHint !== undefined) {
    body.severityHint = data.severityHint === null
      ? null
      : SEVERITY_HINT_TO_API[data.severityHint];
  }

  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items/${itemId}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Update evidence item failed: ${response.status}`);
  }

  return normalizeEvidenceItem((await response.json()) as EvidenceItemApiRecord);
}

export async function deleteEvidenceItem(incidentId: number, id: number): Promise<void> {
  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Delete evidence item failed: ${response.status}`);
  }
}

export async function fetchInvestigationSessions(
  incidentId: number
): Promise<InvestigationSession[]> {
  const response = await fetch(`/api/ha-investigation-sessions?incidentId=${incidentId}`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as InvestigationSession[];
}

/** Exported for unit tests — UI status → backend IncidentStatusEnum name. */
export function mapIncidentStatusToApi(status: IncidentStatus): string {
  return STATUS_TO_API[status];
}
