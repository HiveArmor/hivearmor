/**
 * Search Service
 * Confirmed Search & Hunt API calls only:
 *   POST /api/ha-search/nl-query
 *   GET/POST/PUT/DELETE /api/ha-saved-queries[+/{id}]
 *
 * Request/response shapes match backend:
 *   NlQueryRequest (question + optional indexPattern)
 *   UtmSavedQuery (queryName / queryText / isShared / userLogin)
 */

import { apiClient } from '@/lib/apiClient';

/** Backend: com.hivearmor.service.dto.search.NlQueryRequest */
export interface HaNlQueryRequest {
  question: string;
  indexPattern?: string;
  schema?: { fields?: string[] };
}

/** Backend: com.hivearmor.service.dto.search.NlQueryResultDTO */
export interface HaNlQueryResult {
  /** Raw OpenSearch DSL JSON (may arrive as object or string). */
  query?: unknown;
  explanation?: string;
  suggestedFilters?: Array<{ field?: string; value?: string; label?: string }>;
  error?: string;
}

/** Backend: com.hivearmor.domain.UtmSavedQuery */
export interface HaSavedQuery {
  id?: number;
  userLogin?: string;
  queryName: string;
  queryText: string;
  indexPattern?: string | null;
  timeRange?: string | null;
  filters?: string | null;
  isShared?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function runNlQuery(req: HaNlQueryRequest): Promise<HaNlQueryResult> {
  return apiClient.post<HaNlQueryResult>('/ha-search/nl-query', req);
}

export async function getSavedQueries(): Promise<HaSavedQuery[]> {
  return apiClient.get<HaSavedQuery[]>('/ha-saved-queries');
}

export async function createSavedQuery(
  req: Pick<HaSavedQuery, 'queryName' | 'queryText'> &
    Partial<Pick<HaSavedQuery, 'indexPattern' | 'timeRange' | 'filters' | 'isShared'>>,
): Promise<HaSavedQuery> {
  return apiClient.post<HaSavedQuery>('/ha-saved-queries', req);
}

export async function updateSavedQuery(id: number, req: Partial<HaSavedQuery>): Promise<HaSavedQuery> {
  return apiClient.put<HaSavedQuery>(`/ha-saved-queries/${id}`, req);
}

export async function deleteSavedQuery(id: number): Promise<void> {
  return apiClient.delete<void>(`/ha-saved-queries/${id}`);
}
