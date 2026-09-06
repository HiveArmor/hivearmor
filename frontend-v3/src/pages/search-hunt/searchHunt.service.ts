import type {
  HistoryEntry,
  HuntActionRequest,
  HuntActionResponse,
  HuntEventDetail,
  HuntEventDetailResponse,
  HuntFieldDefinition,
  HuntFieldValuesResponse,
  HuntFieldStatsResponse,
  HuntPromotionApproval,
  HuntSearchRequest,
  HuntSearchResponse,
  PromotionPreview,
  PromotionResult,
  QueryCapabilities,
  SavedHunt,
  SavedQueryDTO,
  SearchExecuteRequest,
  SearchExecuteResponse,
  SearchStatus,
  TimeRangeDTO,
  EventDTO,
} from './searchHunt.types';

import { ApiError, apiClient } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/** True when the backend rejected execute because manager approval is required. */
export function isHuntApprovalRequiredError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const body = error.body as { error?: string; message?: string; detail?: string };
  const code = body.error ?? '';
  const text = `${body.message ?? ''} ${body.detail ?? ''} ${error.message}`;
  return code === 'APPROVAL_REQUIRED' || text.includes('APPROVAL_REQUIRED');
}

/**
 * True when the hunt search snapshot (PIT session) has expired or is gone — the backend returns
 * HTTP 410 HUNT_SEARCH_EXPIRED or 404 HUNT_SEARCH_NOT_FOUND (code carried as a ProblemDetail
 * property). The UI must offer "run the hunt again" rather than a dead generic Retry.
 */
export function isHuntSessionExpiredError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 410 || error.status === 404) return true;
  const body = error.body as { code?: string; error?: string; message?: string; detail?: string };
  const code = body.code ?? body.error ?? '';
  const text = `${code} ${body.message ?? ''} ${body.detail ?? ''} ${error.message}`;
  return text.includes('HUNT_SEARCH_EXPIRED') || text.includes('HUNT_SEARCH_NOT_FOUND') || text.includes('HUNT_EVENT_NOT_FOUND');
}

export async function executeHunt(request: HuntSearchRequest, signal?: AbortSignal): Promise<HuntSearchResponse> {
  if (fixtureMode) {
    const { executeFoundationHunt } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return executeFoundationHunt(request, signal);
  }
  return apiClient.post<HuntSearchResponse>('/ha-hunts/search', request, { signal });
}

export async function cancelHunt(searchId: string): Promise<void> {
  if (fixtureMode) return Promise.resolve();
  return apiClient.delete<void>(`/ha-hunts/search/${encodeURIComponent(searchId)}`);
}

export async function fetchHuntSchema(signal?: AbortSignal): Promise<HuntFieldDefinition[]> {
  if (fixtureMode) {
    const { foundationHuntFields } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return foundationHuntFields;
  }
  return apiClient.get<HuntFieldDefinition[]>('/ha-hunts/schema', { signal });
}

export async function fetchHuntFieldValues(
  searchId: string,
  field: string,
  cursor: string | null,
  query: string,
  signal?: AbortSignal,
): Promise<HuntFieldValuesResponse> {
  if (fixtureMode) {
    const { getFoundationHuntFieldValues } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return getFoundationHuntFieldValues(searchId, field, cursor, query, signal);
  }
  return apiClient.get<HuntFieldValuesResponse>(
    `/ha-hunts/search/${encodeURIComponent(searchId)}/fields/${encodeURIComponent(field)}/values`,
    { params: { cursor: cursor ?? undefined, limit: 10, q: query || undefined }, signal },
  );
}

export async function fetchHuntFieldStats(searchId: string, signal?: AbortSignal): Promise<HuntFieldStatsResponse> {
  if (fixtureMode) {
    const { getFoundationHuntFieldStats } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return getFoundationHuntFieldStats(searchId);
  }
  return apiClient.get<HuntFieldStatsResponse>(
    `/ha-hunts/search/${encodeURIComponent(searchId)}/field-stats`,
    { signal },
  );
}

export async function fetchHuntEventDetail(eventId: string, searchId: string, signal?: AbortSignal): Promise<HuntEventDetail> {
  if (fixtureMode) {
    const { getFoundationHuntEventDetail } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return getFoundationHuntEventDetail(eventId);
  }
  return apiClient.get<HuntEventDetail>(`/ha-hunts/events/${encodeURIComponent(eventId)}`, {
    params: { searchId, views: 'normalized,raw,pivots,permissions' },
    signal,
  });
}

const HUNT_ACTION_MAP: Record<HuntActionRequest['type'], 'create_evidence' | 'create_investigation' | 'escalate_incident'> = {
  add_evidence: 'create_evidence',
  create_investigation: 'create_investigation',
  create_incident: 'escalate_incident',
};

export async function executeHuntAction(request: HuntActionRequest): Promise<HuntActionResponse> {
  // Fixture mode must never claim a real incident/evidence/investigation was created.
  if (fixtureMode) {
    return {
      outcome: 'simulated',
      targetId: `SIM-${request.type.toUpperCase()}`,
      auditId: 'AUDIT-FIXTURE',
    };
  }
  const action = HUNT_ACTION_MAP[request.type];
  const preview = await previewPromotion({ action, eventIds: request.eventIds, searchId: request.searchId });
  const title = request.title?.trim() || preview.preview.title;
  const description = request.reason;

  if (preview.approvalRequired === true) {
    const approval = await requestHuntPromotionApproval({
      action,
      eventIds: request.eventIds,
      searchId: request.searchId,
      previewToken: preview.previewToken,
      rationale: description.trim() || title,
    });
    return {
      outcome: 'approval_pending',
      targetId: approval.approvalId,
      auditId: approval.approvalId,
      approvalId: approval.approvalId,
    };
  }

  const result = await executePromotion({
    action,
    eventIds: request.eventIds,
    searchId: request.searchId,
    title,
    description,
    previewToken: preview.previewToken,
    parameters: request.incidentId ? { incidentId: request.incidentId } : undefined,
  });
  return {
    outcome: 'created',
    targetId: result.resultId,
    auditId: result.actionId,
  };
}

function resolveTimeRange(range: TimeRangeDTO): { from: string; to: string } {
  const to = range.to ?? new Date().toISOString();
  if (range.from) {
    return { from: range.from, to };
  }
  const now = Date.now();
  const presetMs: Record<NonNullable<TimeRangeDTO['preset']>, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const windowMs = range.preset ? presetMs[range.preset] : 24 * 60 * 60 * 1000;
  return { from: new Date(now - windowMs).toISOString(), to: new Date(now).toISOString() };
}

interface TimelineEventDTO {
  id: string;
  timestamp: string | null;
  eventType: string | null;
  severity: number | null;
  dataType: string | null;
}

export async function executeSearch(request: SearchExecuteRequest): Promise<SearchExecuteResponse> {
  const { from, to } = resolveTimeRange(request.timeRange);
  const events = await apiClient.get<TimelineEventDTO[]>('/ha-search/timeline', {
    params: { query: request.query, from, to },
  });
  const hits: EventDTO[] = events.map((event) => ({
    '@timestamp': event.timestamp ?? '',
    id: event.id,
    dataType: event.dataType ?? undefined,
    eventType: event.eventType ?? undefined,
    'event.severity': event.severity ?? undefined,
  }));
  return {
    hits,
    total: hits.length,
    took: 0,
    histogram: [],
  };
}

export async function listSavedQueries(): Promise<SavedQueryDTO[]> {
  return apiClient.get<SavedQueryDTO[]>('/ha-saved-queries');
}

export async function saveQuery(
  query: Pick<SavedQueryDTO, 'queryName' | 'queryText'> &
    Partial<Pick<SavedQueryDTO, 'indexPattern' | 'timeRange' | 'filters' | 'isShared'>>,
): Promise<SavedQueryDTO> {
  return apiClient.post<SavedQueryDTO>('/ha-saved-queries', query);
}

export async function deleteSavedQuery(id: number | string): Promise<void> {
  return apiClient.delete<void>(`/ha-saved-queries/${id}`);
}

// A2-SRCH-02: removed unused NL-query and legacy IOC helpers that were never mounted
// on SearchHuntPage. TI lookups use @/services/threatIntel.service → POST /ha-threat-intel/lookup.

// --- Hunt completion service functions (Sprint 42) ---

/** HNT-002: Fetch search status and diagnostics */
export async function fetchSearchStatus(searchId: string): Promise<SearchStatus> {
  return apiClient.get<SearchStatus>(`/ha-hunts/search/${encodeURIComponent(searchId)}/status`);
}

/** HNT-002: Cancel a running search and retrieve partial results count */
export async function cancelSearch(searchId: string): Promise<void> {
  return apiClient.delete<void>(`/ha-hunts/search/${encodeURIComponent(searchId)}`);
}

/** HNT-004 + HNT-006: Fetch event detail with highlighted fields or raw data, plus pivots */
export async function fetchHuntEvent(
  eventId: string,
  view: 'highlighted' | 'raw',
  searchId: string,
): Promise<HuntEventDetailResponse> {
  if (fixtureMode) {
    const { getFoundationHuntEventResponse } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return getFoundationHuntEventResponse(eventId, view);
  }
  return apiClient.get<HuntEventDetailResponse>(`/ha-hunts/events/${encodeURIComponent(eventId)}`, {
    params: { view, searchId },
  });
}

/** HNT-005: Fetch saved hunts with optional search/tag filters */
export async function fetchSavedHunts(
  params?: { search?: string; tags?: string },
): Promise<{ items: SavedHunt[]; total: number }> {
  if (fixtureMode) {
    const { getFoundationSavedHunts } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return getFoundationSavedHunts(params);
  }
  return apiClient.get<{ items: SavedHunt[]; total: number }>('/ha-hunts/saved', { params });
}

/** HNT-005: Create a new saved hunt */
export async function createSavedHunt(body: {
  name: string;
  description?: string;
  query: string;
  tags: string[];
  shared: boolean;
}): Promise<SavedHunt> {
  return apiClient.post<SavedHunt>('/ha-hunts/saved', body);
}

/** HNT-005: Update an existing saved hunt */
export async function updateSavedHunt(huntId: string, body: Partial<SavedHunt>): Promise<SavedHunt> {
  return apiClient.patch<SavedHunt>(`/ha-hunts/saved/${encodeURIComponent(huntId)}`, body);
}

/** HNT-005: Delete a saved hunt */
export async function deleteSavedHunt(huntId: string): Promise<void> {
  return apiClient.delete<void>(`/ha-hunts/saved/${encodeURIComponent(huntId)}`);
}

/** HNT-005: Fetch hunt history with optional date range filters */
export async function fetchHuntHistory(
  params?: { from?: string; to?: string },
): Promise<{ items: HistoryEntry[]; total: number }> {
  if (fixtureMode) {
    const { getFoundationHuntHistory } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return getFoundationHuntHistory();
  }
  return apiClient.get<{ items: HistoryEntry[]; total: number }>('/ha-hunts/history', { params });
}

/** HNT-005: Clear hunt history (optionally before a date) */
export async function clearHuntHistory(before?: string): Promise<{ deleted: number }> {
  return apiClient.delete<{ deleted: number }>('/ha-hunts/history', {
    params: before ? { before } : undefined,
  });
}

/** HNT-007: Preview a promotion action (create evidence, investigation, or incident) */
export async function previewPromotion(body: {
  action: string;
  eventIds: string[];
  searchId: string;
}): Promise<PromotionPreview> {
  return apiClient.post<PromotionPreview>('/ha-hunts/actions/preview', body);
}

/** HNT-007: Request SOC Manager approval when preview.approvalRequired is true */
export async function requestHuntPromotionApproval(body: {
  action: string;
  eventIds: string[];
  searchId: string;
  previewToken: string;
  rationale: string;
}): Promise<HuntPromotionApproval> {
  return apiClient.post<HuntPromotionApproval>('/ha-hunts/approvals', body);
}

/** HNT-007: Execute a promotion action (pass parameters.approvalId when gated) */
export async function executePromotion(body: {
  action: string;
  eventIds: string[];
  searchId: string;
  title: string;
  description: string;
  previewToken: string;
  parameters?: Record<string, string>;
}): Promise<PromotionResult> {
  return apiClient.post<PromotionResult>('/ha-hunts/actions', body);
}

/** HNT-009: Fetch query language capabilities (operators, functions, field types, examples) */
export async function fetchQueryCapabilities(): Promise<QueryCapabilities> {
  return apiClient.get<QueryCapabilities>('/ha-hunts/query-capabilities');
}

export { fixtureMode as searchHuntFixtureMode };
