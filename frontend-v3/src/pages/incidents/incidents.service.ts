/**
 * Incident queue adapter.
 *
 * The legacy API is a JHipster criteria endpoint. This module is the only
 * place where that transport shape is exposed; the page consumes normalized
 * incident/status values and bounded pages.
 */

import type {
  IncidentFilters,
  IncidentListItem,
  IncidentQueueSummary,
} from './incidents.types';

import type { PaginatedResponse } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export class IncidentApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'IncidentApiError';
  }
}

export interface IncidentListParams {
  page?: number;
  size?: number;
  sort?: string;
  status?: string;
  severityMin?: number;
  severityMax?: number;
  priority?: string;
  assignedTo?: string;
  assignedSpecified?: boolean;
  createdFrom?: string;
  createdTo?: string;
  slaBreached?: boolean;
  q?: string;
}

interface IncidentApiRecord extends Omit<IncidentListItem, 'incidentStatus'> {
  incidentStatus: string;
}

const STATUS_TO_API: Record<string, string> = {
  open: 'OPEN',
  in_progress: 'IN_REVIEW',
  resolved: 'COMPLETED',
  closed: 'MERGED',
};

const STATUS_FROM_API: Record<string, IncidentListItem['incidentStatus']> = {
  OPEN: 'open',
  IN_REVIEW: 'in_progress',
  COMPLETED: 'resolved',
  MERGED: 'closed',
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('hivearmor_auth_token');
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeIncident(record: IncidentApiRecord): IncidentListItem {
  return {
    ...record,
    incidentPriority: record.incidentPriority ?? 'P3',
    incidentStatus: STATUS_FROM_API[record.incidentStatus] ?? 'open',
    slaBreached: record.slaBreached ?? false,
  };
}

function toQuery(params: IncidentListParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.size !== undefined) query.set('size', String(params.size));
  if (params.sort) query.set('sort', params.sort);
  if (params.status) query.set('incidentStatus.in', params.status.split(',').map((value) => STATUS_TO_API[value] ?? value).join(','));
  if (params.severityMin !== undefined) query.set('incidentSeverity.greaterThanOrEqual', String(params.severityMin));
  if (params.severityMax !== undefined) query.set('incidentSeverity.lessThanOrEqual', String(params.severityMax));
  if (params.priority) query.set('incidentPriority.in', params.priority);
  if (params.assignedTo) query.set('incidentAssignedTo.equals', params.assignedTo);
  if (params.assignedSpecified !== undefined) query.set('incidentAssignedTo.specified', String(params.assignedSpecified));
  if (params.createdFrom) query.set('incidentCreatedDate.greaterThanOrEqual', params.createdFrom);
  if (params.createdTo) query.set('incidentCreatedDate.lessThanOrEqual', params.createdTo);
  if (params.slaBreached !== undefined) query.set('slaBreached.equals', String(params.slaBreached));
  if (params.q) query.set('incidentName.contains', params.q);
  return query;
}

export async function fetchIncidents(
  params: IncidentListParams,
  signal?: AbortSignal
): Promise<PaginatedResponse<IncidentListItem>> {
  if (fixtureMode) {
    const { fetchFixtureIncidents } = await import('@/pages/incidents/incidents.fixtures');
    return fetchFixtureIncidents(params, signal);
  }
  const query = toQuery(params);
  const response = await fetch(`/api/ha-incidents?${query.toString()}`, {
    headers: authHeaders(),
    signal,
  });

  if (!response.ok) {
    throw new IncidentApiError(response.status, `Incident queue request failed (${response.status})`);
  }

  const records = (await response.json()) as IncidentApiRecord[];
  return {
    items: records.map(normalizeIncident),
    total: Number.parseInt(response.headers.get('X-Total-Count') ?? String(records.length), 10),
  };
}

async function fetchIncidentCount(params: IncidentListParams, signal?: AbortSignal): Promise<number> {
  const result = await fetchIncidents({ ...params, page: 0, size: 1 }, signal);
  return result.total;
}

export async function fetchIncidentQueueSummary(
  analystLogin: string | undefined,
  signal?: AbortSignal
): Promise<IncidentQueueSummary> {
  if (fixtureMode) {
    const { fetchFixtureIncidentSummary } = await import('@/pages/incidents/incidents.fixtures');
    return fetchFixtureIncidentSummary(analystLogin, signal);
  }
  const activeStatuses = 'open,in_progress';
  const results = await Promise.allSettled([
    fetchIncidentCount({ status: activeStatuses }, signal),
    fetchIncidentCount({ status: activeStatuses, priority: 'P1' }, signal),
    fetchIncidentCount({ status: activeStatuses, slaBreached: true }, signal),
    fetchIncidentCount({ status: activeStatuses, assignedSpecified: false }, signal),
    analystLogin ? fetchIncidentCount({ status: activeStatuses, assignedTo: analystLogin }, signal) : Promise.resolve(0),
  ]);
  const value = (index: number): number | null => results[index]?.status === 'fulfilled' ? results[index].value : null;
  return {
    active: value(0) ?? 0,
    critical: value(1),
    breached: value(2),
    unassigned: value(3),
    assignedToMe: value(4),
    snapshotAt: new Date().toISOString(),
    partial: results.some((result) => result.status === 'rejected'),
  };
}

export function filtersToParams(filters: IncidentFilters): IncidentListParams {
  const severityRanges: Record<string, [number, number]> = {
    critical: [9, 10], high: [7, 8], medium: [4, 6], low: [1, 3],
  };
  const severity = filters.severity?.[0];
  const range = severity ? severityRanges[severity] : undefined;
  return {
    status: filters.status?.join(','),
    severityMin: range?.[0],
    severityMax: range?.[1],
    priority: filters.priority?.join(','),
    assignedTo: filters.assignedTo,
    assignedSpecified: filters.unassignedOnly ? false : undefined,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    slaBreached: filters.slaBreached,
    q: filters.q,
  };
}

export async function updateIncidentPriority(id: number, priority: string): Promise<void> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-incidents/${id}/priority`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ priority }),
  });
  if (!response.ok) {
    throw new IncidentApiError(response.status, `Incident priority update failed (${response.status})`);
  }
}
