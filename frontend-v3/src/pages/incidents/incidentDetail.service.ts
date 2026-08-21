/**
 * Incident Detail Service
 * Fetch operations for incident investigation workbench per CMD-04
 */

import type {
  EvidenceItem,
  IncidentDetail,
  InvestigationSession,
  TimelineEvent,
} from './incidentDetail.types';

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

const STATUS_FROM_API: Record<string, IncidentStatus> = {
  OPEN: 'open',
  IN_REVIEW: 'in_progress',
  COMPLETED: 'resolved',
  MERGED: 'closed',
};

const STATUS_TO_API: Record<IncidentStatus, string> = {
  open: 'OPEN',
  in_progress: 'IN_REVIEW',
  resolved: 'COMPLETED',
  closed: 'COMPLETED',
};

export async function fetchIncidentDetail(id: number): Promise<IncidentDetail> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-incidents/${id}`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
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

// FIX-06: generic PUT /api/ha-incidents/{id} → PUT /api/ha-incidents/change-status
// The backend has no generic single-incident PUT; use the change-status endpoint instead.
export async function updateIncidentDetail(
  id: number,
  data: Partial<IncidentDetail>
): Promise<void> {
  if (data.incidentStatus !== undefined) {
    await changeIncidentStatus(id, data.incidentStatus);
    return;
  }

  // TODO: WIRING-GAP — no generic PUT endpoint for incident fields other than status/priority.
  // Backend only exposes change-status and /priority. Log a warning and no-op.
  console.warn('[WIRING-GAP] updateIncidentDetail called with unsupported fields:', Object.keys(data));
}

// FIX-06: PATCH /api/ha-incidents/{id} → PUT /api/ha-incidents/change-status
export async function closeIncident(id: number): Promise<void> {
  return changeIncidentStatus(id, 'closed');
}

export async function changeIncidentStatus(id: number, status: IncidentStatus): Promise<void> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch('/api/ha-incidents/change-status', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
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
  const token = localStorage.getItem('hivearmor_auth_token') ?? '';
  const params = new URLSearchParams({
    incidentId: String(incidentId),
    page: '0',
    size: String(size),
    sort: '@timestamp',
    order: 'desc',
  });
  const response = await fetch(`/api/ha-alerts?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return {
    items: (await response.json()) as UtmAlert[],
    total: Number.parseInt(response.headers.get('X-Total-Count') ?? '0', 10),
  };
}

export async function fetchIncidentTimeline(incidentId: number): Promise<TimelineEvent[]> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-incidents/${incidentId}/timeline`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as TimelineEvent[];
}

// FIX-05: /api/ha-evidence-items?incidentId=X → /api/ha-incidents/{incidentId}/evidence-items
export async function fetchEvidenceItems(incidentId: number): Promise<EvidenceItem[]> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as EvidenceItem[];
}

// FIX-05: POST /api/ha-evidence-items → POST /api/ha-incidents/{incidentId}/evidence-items
export async function createEvidenceItem(data: {
  incidentId: number;
  itemType: EvidenceItem['itemType'];
  title: string;
  content?: string;
  sourceRef?: string;
  severityHint?: EvidenceItem['severityHint'];
}): Promise<EvidenceItem> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const { incidentId, ...body } = data;
  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Create evidence item failed: ${response.status}`);
  }

  return (await response.json()) as EvidenceItem;
}

// FIX-05: DELETE /api/ha-evidence-items/{id} → DELETE /api/ha-incidents/{incidentId}/evidence-items/{id}
export async function deleteEvidenceItem(incidentId: number, id: number): Promise<void> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-incidents/${incidentId}/evidence-items/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Delete evidence item failed: ${response.status}`);
  }
}

export async function fetchInvestigationSessions(
  incidentId: number
): Promise<InvestigationSession[]> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-investigation-sessions?incidentId=${incidentId}`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as InvestigationSession[];
}
