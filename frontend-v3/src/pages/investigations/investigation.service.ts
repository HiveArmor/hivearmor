import type {
  CreateInvestigationInput,
  CreateInvestigationTaskInput,
  InvestigationDetail,
  InvestigationListParams,
  InvestigationPageResult,
  InvestigationSession,
  InvestigationSessionItem,
  InvestigationSessionTask,
  PinInvestigationItemInput,
  UpdateInvestigationInput,
  UpdateInvestigationTaskInput,
} from './investigation.types';

import { useAuthStore } from '@/store/auth.store';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export class InvestigationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'InvestigationApiError';
  }
}

function headers(): HeadersInit {
  const token = localStorage.getItem('hivearmor_auth_token');
  const tenantId = useAuthStore.getState().selectedTenantId;
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId !== null ? { 'X-Tenant-ID': String(tenantId) } : {}),
  };
}

async function ensureResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new InvestigationApiError(response.status, `Investigation request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function normalizeSession(session: InvestigationSession): InvestigationSession {
  return {
    ...session,
    status: session.status ?? 'ACTIVE',
    description: session.description ?? null,
    assignedTo: session.assignedTo ?? null,
    incidentId: session.incidentId ?? null,
    itemCount: session.itemCount ?? 0,
  };
}

function normalizeTask(task: InvestigationSessionTask): InvestigationSessionTask {
  return {
    ...task,
    status: task.status ?? 'OPEN',
    assignee: task.assignee ?? null,
    externalTicketUrl: task.externalTicketUrl ?? null,
  };
}

function toDetail(session: InvestigationSession): InvestigationDetail {
  return {
    ...normalizeSession(session),
    phase: session.status === 'CONVERTED' ? 'act' : session.status === 'CLOSED' || session.status === 'ARCHIVED' ? 'knowledge' : 'prepare',
    hypothesis: null,
    objective: session.description,
    timeRange: null,
    dataSources: [],
    techniques: [],
    hypotheses: [],
    activity: [],
    nextActions: [],
    conclusion: null,
    artifactsProduced: [],
  };
}

export async function listInvestigations(params: InvestigationListParams, signal?: AbortSignal): Promise<InvestigationPageResult> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.listFixtureInvestigations(params);
  }

  const query = new URLSearchParams({ page: String(params.page), size: String(params.size), sort: 'createdAt,desc' });
  const response = await fetch(`/api/ha-investigation-sessions?${query.toString()}`, { headers: headers(), signal });
  const records = await ensureResponse<InvestigationSession[]>(response);
  const search = params.search?.trim().toLowerCase();
  const filtered = records.map(normalizeSession).filter((session) => {
    if (params.status && params.status !== 'ALL' && session.status !== params.status) return false;
    if (params.ownership === 'mine') {
      const login = useAuthStore.getState().user?.login;
      if (login && session.assignedTo !== login && session.createdBy !== login) return false;
    }
    if (search && !`${session.id} ${session.sessionName} ${session.description ?? ''} ${session.assignedTo ?? ''}`.toLowerCase().includes(search)) return false;
    return true;
  });

  return {
    items: filtered,
    total: Number.parseInt(response.headers.get('X-Total-Count') ?? String(records.length), 10),
    page: params.page,
    size: params.size,
    snapshotAt: new Date().toISOString(),
    filtering: params.search || (params.status && params.status !== 'ALL') || params.ownership === 'mine' ? 'loaded_projection' : 'authoritative',
  };
}

export async function fetchInvestigation(id: number, signal?: AbortSignal): Promise<InvestigationDetail> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.getFixtureInvestigation(id);
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}`, { headers: headers(), signal });
  return toDetail(await ensureResponse<InvestigationSession>(response));
}

export async function fetchInvestigationItems(id: number, signal?: AbortSignal): Promise<InvestigationSessionItem[]> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.getFixtureInvestigationItems(id);
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/items`, { headers: headers(), signal });
  return ensureResponse<InvestigationSessionItem[]>(response);
}

export async function createInvestigation(input: CreateInvestigationInput): Promise<InvestigationSession> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.createFixtureInvestigation(input);
  }
  const response = await fetch('/api/ha-investigation-sessions', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ id: null, version: null, tenantId: null, sessionName: input.sessionName, description: input.description, status: 'ACTIVE', createdBy: null, assignedTo: input.assignedTo ?? null, incidentId: null, createdAt: null, updatedAt: null, itemCount: 0 }),
  });
  return normalizeSession(await ensureResponse<InvestigationSession>(response));
}

export async function updateInvestigation(id: number, input: UpdateInvestigationInput): Promise<InvestigationSession> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.updateFixtureInvestigation(id, input);
  }
  const current = await fetchInvestigation(id);
  const response = await fetch(`/api/ha-investigation-sessions/${id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify({ ...current, ...input, version: input.version ?? current.version }),
  });
  return normalizeSession(await ensureResponse<InvestigationSession>(response));
}

export async function pinInvestigationItem(id: number, input: PinInvestigationItemInput): Promise<InvestigationSessionItem> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.pinFixtureInvestigationItem(id, input);
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/items`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ id: null, sessionId: id, ...input, addedBy: null, addedAt: null }),
  });
  return ensureResponse<InvestigationSessionItem>(response);
}

export async function unpinInvestigationItem(id: number, itemId: number): Promise<void> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.unpinFixtureInvestigationItem(id, itemId);
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/items/${itemId}`, { method: 'DELETE', headers: headers() });
  await ensureResponse<void>(response);
}

export async function convertInvestigationToIncident(id: number): Promise<{ incidentId: number }> {
  if (fixtureMode) {
    const fixture = await import('@/pages/investigations/investigation.fixtures');
    return fixture.convertFixtureInvestigation(id);
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/convert-to-incident`, { method: 'POST', headers: headers() });
  return ensureResponse<{ incidentId: number }>(response);
}

export async function fetchInvestigationTasks(id: number, signal?: AbortSignal): Promise<InvestigationSessionTask[]> {
  if (fixtureMode) {
    return [];
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/tasks`, { headers: headers(), signal });
  const tasks = await ensureResponse<InvestigationSessionTask[]>(response);
  return tasks.map(normalizeTask);
}

export async function createInvestigationTask(id: number, input: CreateInvestigationTaskInput): Promise<InvestigationSessionTask> {
  if (fixtureMode) {
    const now = new Date().toISOString();
    return normalizeTask({
      id: Date.now(),
      sessionId: id,
      title: input.title,
      status: input.status ?? 'OPEN',
      assignee: input.assignee ?? null,
      externalTicketUrl: input.externalTicketUrl ?? null,
      createdBy: useAuthStore.getState().user?.login ?? 'fixture',
      createdAt: now,
      updatedAt: now,
    });
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/tasks`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      id: null,
      sessionId: id,
      title: input.title,
      status: input.status ?? 'OPEN',
      assignee: input.assignee ?? null,
      externalTicketUrl: input.externalTicketUrl ?? null,
      createdBy: null,
      createdAt: null,
      updatedAt: null,
    }),
  });
  return normalizeTask(await ensureResponse<InvestigationSessionTask>(response));
}

export async function updateInvestigationTask(
  id: number,
  taskId: number,
  current: InvestigationSessionTask,
  input: UpdateInvestigationTaskInput,
): Promise<InvestigationSessionTask> {
  if (fixtureMode) {
    return normalizeTask({
      ...current,
      ...input,
      title: input.title ?? current.title,
      status: input.status ?? current.status,
      assignee: input.assignee !== undefined ? input.assignee : current.assignee,
      externalTicketUrl: input.externalTicketUrl !== undefined ? input.externalTicketUrl : current.externalTicketUrl,
      updatedAt: new Date().toISOString(),
    });
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/tasks/${taskId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      id: taskId,
      sessionId: id,
      title: input.title ?? current.title,
      status: input.status ?? current.status,
      assignee: input.assignee !== undefined ? input.assignee : current.assignee,
      externalTicketUrl: input.externalTicketUrl !== undefined ? input.externalTicketUrl : current.externalTicketUrl,
      createdBy: current.createdBy,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    }),
  });
  return normalizeTask(await ensureResponse<InvestigationSessionTask>(response));
}

export async function deleteInvestigationTask(id: number, taskId: number): Promise<void> {
  if (fixtureMode) {
    return;
  }
  const response = await fetch(`/api/ha-investigation-sessions/${id}/tasks/${taskId}`, { method: 'DELETE', headers: headers() });
  await ensureResponse<void>(response);
}
