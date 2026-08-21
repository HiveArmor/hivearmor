/**
 * Incident Workbench Service — API functions
 * Sprint 43 INC-001 through INC-008 endpoint calls.
 */

import type {
  ActionPreview,
  ActivityEntry,
  ActivityFeedResponse,
  ActivityType,
  AddCustodyEventBody,
  AddNoteBody,
  ConflictResponse,
  CreateTaskBody,
  CustodyEvent,
  EvidenceProvenance,
  ExecuteActionBody,
  ExecuteActionResponse,
  IncidentEventSearchRequest,
  IncidentEventSearchResponse,
  IncidentPatch,
  IncidentTask,
  PatchedIncident,
  ResponseAction,
  SimilarIncidentsResponse,
  TaskListResponse,
  TaskStatus,
  UpdateEvidenceClassificationBody,
  UpdateTaskBody,
} from '../types/incident-workbench.types';

import { ApiError, apiClient } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

interface ResponseActionTransport extends Partial<ResponseAction> {
  id: string;
  name: string;
  description: string;
  category: ResponseAction['category'];
  targetType?: string;
  requiresApproval?: boolean;
}

interface ResponseActionCatalogTransport {
  actions: ResponseActionTransport[];
}

interface ActionPreviewTransport {
  actionId: string;
  actionName?: string;
  name?: string;
  targets?: Array<{ id?: unknown; type?: unknown; value?: unknown }>;
  impact?: {
    description?: unknown;
    reversible?: unknown;
  };
  previewToken: string;
  expiresAt: string;
  executionReady?: boolean;
}

// --- INC-001: Metadata edit with optimistic concurrency ---

export interface PatchIncidentResult {
  data: PatchedIncident;
  etag: string;
}

/**
 * PATCH /ha-incidents/{id} with If-Match header for optimistic concurrency.
 * On 409 Conflict, throws an ApiError whose body matches ConflictResponse.
 */
export async function patchIncident(
  incidentId: string,
  patch: IncidentPatch,
  etag: string
): Promise<PatchIncidentResult> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(`/api/ha-incidents/${encodeURIComponent(incidentId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
      'If-Match': etag,
    },
    body: JSON.stringify(patch),
  });

  if (response.status === 409) {
    const conflict = (await response.json()) as ConflictResponse;
    throw new ApiError(409, { status: 409, ...conflict });
  }

  if (!response.ok) {
    throw new ApiError(response.status, { status: response.status, message: response.statusText });
  }

  const data = (await response.json()) as PatchedIncident;
  const newEtag = response.headers.get('ETag') ?? String(data.version);

  return { data, etag: newEtag };
}

// --- INC-002: Task CRUD ---

export interface ListTasksParams {
  cursor?: string;
  limit?: number;
  status?: TaskStatus;
}

export async function listTasks(
  incidentId: string,
  params: ListTasksParams = {}
): Promise<TaskListResponse> {
  if (fixtureMode) {
    const { fixtureListTasks } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureListTasks(params.status);
  }
  return apiClient.get<TaskListResponse>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/tasks`,
    {
      params: {
        cursor: params.cursor,
        limit: params.limit,
        status: params.status,
      },
    }
  );
}

export async function createTask(
  incidentId: string,
  body: CreateTaskBody
): Promise<IncidentTask> {
  if (fixtureMode) {
    const { fixtureCreateTask } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureCreateTask(body);
  }
  return apiClient.post<IncidentTask>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/tasks`,
    body
  );
}

export async function updateTask(
  incidentId: string,
  taskId: string,
  body: UpdateTaskBody,
  etag: string
): Promise<IncidentTask> {
  if (fixtureMode) {
    const { fixtureUpdateTask } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureUpdateTask(taskId, body);
  }
  const token = localStorage.getItem('hivearmor_auth_token');
  const response = await fetch(
    `/api/ha-incidents/${encodeURIComponent(incidentId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
        'If-Match': etag,
      },
      body: JSON.stringify(body),
    }
  );

  if (response.status === 409) {
    const conflict = await response.json();
    throw new ApiError(409, { status: 409, ...(conflict as object) });
  }

  if (!response.ok) {
    throw new ApiError(response.status, { status: response.status, message: response.statusText });
  }

  return (await response.json()) as IncidentTask;
}

// --- INC-003: Similar incidents ---

export interface FindSimilarParams {
  window?: string;
  limit?: number;
}

export async function findSimilar(
  incidentId: string,
  params: FindSimilarParams = {}
): Promise<SimilarIncidentsResponse> {
  if (fixtureMode) {
    const { fixtureFindSimilar } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureFindSimilar();
  }
  return apiClient.get<SimilarIncidentsResponse>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/similar`,
    {
      params: {
        window: params.window ?? '30d',
        limit: params.limit ?? 20,
      },
    }
  );
}

// --- INC-004: Incident-scoped event search ---

export async function searchIncidentEvents(
  incidentId: string,
  body: IncidentEventSearchRequest
): Promise<IncidentEventSearchResponse> {
  if (fixtureMode) {
    const { fixtureSearchEvents } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureSearchEvents(body);
  }
  return apiClient.post<IncidentEventSearchResponse>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/events/search`,
    body
  );
}

// --- INC-005: Response action catalog ---

export async function listResponseActions(
  incidentId: string
): Promise<ResponseAction[]> {
  if (fixtureMode) {
    const { fixtureListResponseActions } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureListResponseActions();
  }
  const response = await apiClient.get<ResponseActionTransport[] | ResponseActionCatalogTransport>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/response-actions`
  );
  const actions = Array.isArray(response) ? response : response.actions;
  return actions.map((action) => ({
    id: action.id,
    name: action.name,
    description: action.description,
    category: action.category,
    targets: action.targets ?? [],
    enabled: action.enabled ?? true,
    requiredEntities: action.requiredEntities ?? (action.targetType ? [action.targetType] : []),
    requiresApproval: action.requiresApproval,
    targetType: action.targetType,
  }));
}

export async function previewAction(
  incidentId: string,
  actionId: string
): Promise<ActionPreview> {
  if (fixtureMode) {
    const { fixturePreviewAction } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixturePreviewAction(actionId);
  }
  const response = await apiClient.post<ActionPreviewTransport>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/response-actions/${encodeURIComponent(actionId)}/preview`
  );
  const targets = (response.targets ?? []).map((target) => ({
    id: String(target.id ?? target.value ?? ''),
    type: String(target.type ?? 'entity'),
    value: String(target.value ?? target.id ?? ''),
  }));
  return {
    actionId: response.actionId,
    name: response.name ?? response.actionName ?? response.actionId,
    targets,
    impact: {
      description: String(response.impact?.description ?? 'Impact assessment unavailable'),
      affectedSystems: targets.map((target) => target.value),
      reversible: response.impact?.reversible === true,
    },
    previewToken: response.previewToken,
    expiresAt: response.expiresAt,
    executionReady: response.executionReady === true,
  };
}

export async function executeAction(
  incidentId: string,
  actionId: string,
  body: ExecuteActionBody
): Promise<ExecuteActionResponse> {
  if (fixtureMode) {
    const { fixtureExecuteAction } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureExecuteAction(actionId);
  }
  return apiClient.post<ExecuteActionResponse>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/response-actions/${encodeURIComponent(actionId)}/execute`,
    body
  );
}

// --- INC-006: Collaboration activity feed ---

export interface GetActivityParams {
  cursor?: string;
  limit?: number;
  types?: ActivityType[];
}

export async function getActivity(
  incidentId: string,
  params: GetActivityParams = {}
): Promise<ActivityFeedResponse> {
  if (fixtureMode) {
    const { fixtureGetActivity } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureGetActivity(params.types);
  }
  return apiClient.get<ActivityFeedResponse>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/activity`,
    {
      params: {
        cursor: params.cursor,
        limit: params.limit,
        types: params.types,
      },
    }
  );
}

export async function addNote(
  incidentId: string,
  body: AddNoteBody
): Promise<ActivityEntry> {
  if (fixtureMode) {
    const { fixtureAddNote } = await import('@/pages/incidents/incidentWorkbench.fixtures');
    return fixtureAddNote(body);
  }
  return apiClient.post<ActivityEntry>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/activity/notes`,
    body
  );
}

// --- INC-007: Evidence provenance and custody ---

export async function addCustodyEvent(
  incidentId: string,
  evidenceId: string,
  body: AddCustodyEventBody
): Promise<CustodyEvent> {
  return apiClient.post<CustodyEvent>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/evidence/${encodeURIComponent(evidenceId)}/custody`,
    body
  );
}

export async function updateEvidenceClassification(
  incidentId: string,
  evidenceId: string,
  body: UpdateEvidenceClassificationBody
): Promise<EvidenceProvenance> {
  return apiClient.patch<EvidenceProvenance>(
    `/ha-incidents/${encodeURIComponent(incidentId)}/evidence/${encodeURIComponent(evidenceId)}`,
    body
  );
}
