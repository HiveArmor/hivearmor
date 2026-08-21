/** Development-only fictional incident queue. Loaded only behind both DEV and the explicit fixture flag. */

import type { IncidentListParams } from './incidents.service';
import type { IncidentListItem, IncidentQueueSummary } from './incidents.types';

import type { PaginatedResponse } from '@/lib/apiClient';

const NAMES = [
  'Privileged identity used from an unmanaged endpoint',
  'Encoded PowerShell followed by outbound transfer',
  'Cloud administrator role granted outside change window',
  'Kerberoasting activity across finance services',
  'High-volume authentication failures followed by success',
  'Rare external destination contacted by managed host',
  'Endpoint persistence and credential access sequence',
  'Sensitive archive staged after lateral movement',
];

const DESCRIPTIONS = [
  'Correlated identity and endpoint signals require analyst validation before any containment decision.',
  'A multi-stage execution chain includes encoded command activity and a first-seen external destination.',
  'Privileged access deviated from the approved maintenance window and affected a production scope.',
  'Multiple service-ticket requests originated from a low-prevalence workstation and privileged user context.',
];

const OWNERS = ['maya.chen', 'omar.haddad', null, 'elena.rossi'];
const STATUSES: IncidentListItem['incidentStatus'][] = ['open', 'in_progress', 'open', 'resolved'];
const PRIORITIES: IncidentListItem['incidentPriority'][] = ['P1', 'P2', 'P2', 'P3', 'P3', 'P4'];
const BASE_TIME = Date.now();

const INCIDENTS: IncidentListItem[] = Array.from({ length: 38 }, (_, index) => {
  const created = BASE_TIME - index * 47 * 60_000;
  const priority = PRIORITIES[index % PRIORITIES.length];
  const status = STATUSES[index % STATUSES.length];
  const slaHours = priority === 'P1' ? 1 : priority === 'P2' ? 4 : priority === 'P3' ? 24 : 72;
  const deadline = created + slaHours * 60 * 60_000;
  return {
    id: 9001 + index,
    incidentName: NAMES[index % NAMES.length],
    incidentDescription: DESCRIPTIONS[index % DESCRIPTIONS.length],
    incidentPriority: priority,
    incidentSeverity: priority === 'P1' ? 10 : priority === 'P2' ? 8 : priority === 'P3' ? 5 : 2,
    incidentStatus: status,
    incidentAssignedTo: OWNERS[index % OWNERS.length],
    incidentCreatedDate: new Date(created).toISOString(),
    slaDeadline: new Date(deadline).toISOString(),
    slaBreached: (status === 'open' || status === 'in_progress') && deadline < BASE_TIME,
    incidentSolution: status === 'resolved' ? 'Validated and contained in the fictional review workflow.' : null,
  };
});

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

function filtered(params: IncidentListParams): IncidentListItem[] {
  return INCIDENTS.filter((incident) => {
    const statuses = params.status?.split(',');
    const priorities = params.priority?.split(',');
    if (statuses?.length && !statuses.includes(incident.incidentStatus)) return false;
    if (priorities?.length && !priorities.includes(incident.incidentPriority)) return false;
    if (params.severityMin !== undefined && incident.incidentSeverity < params.severityMin) return false;
    if (params.severityMax !== undefined && incident.incidentSeverity > params.severityMax) return false;
    if (params.assignedTo && incident.incidentAssignedTo !== params.assignedTo) return false;
    if (params.assignedSpecified === false && incident.incidentAssignedTo !== null) return false;
    if (params.slaBreached !== undefined && incident.slaBreached !== params.slaBreached) return false;
    if (params.createdFrom && incident.incidentCreatedDate < params.createdFrom) return false;
    if (params.createdTo && incident.incidentCreatedDate > params.createdTo) return false;
    if (params.q && !incident.incidentName.toLowerCase().includes(params.q.toLowerCase())) return false;
    return true;
  });
}

export async function fetchFixtureIncidents(
  params: IncidentListParams,
  signal?: AbortSignal
): Promise<PaginatedResponse<IncidentListItem>> {
  abortIfNeeded(signal);
  const matches = filtered(params);
  const size = Math.min(100, Math.max(1, params.size ?? 50));
  const page = Math.max(0, params.page ?? 0);
  return { items: matches.slice(page * size, page * size + size), total: matches.length };
}

export async function fetchFixtureIncidentSummary(
  analystLogin: string | undefined,
  signal?: AbortSignal
): Promise<IncidentQueueSummary> {
  abortIfNeeded(signal);
  const active = INCIDENTS.filter((incident) => ['open', 'in_progress'].includes(incident.incidentStatus));
  return {
    active: active.length,
    critical: active.filter((incident) => incident.incidentPriority === 'P1').length,
    breached: active.filter((incident) => incident.slaBreached).length,
    unassigned: active.filter((incident) => !incident.incidentAssignedTo).length,
    assignedToMe: active.filter((incident) => incident.incidentAssignedTo === analystLogin).length,
    snapshotAt: new Date().toISOString(),
    partial: false,
  };
}
