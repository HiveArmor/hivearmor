/**
 * Search Service
 * Search & Hunt page API calls (NL query, saved queries).
 */

import { apiClient } from '@/lib/apiClient';
import type { NlQueryRequest, NlQueryResponse, SavedQuery } from '@/types/api.types';

export async function runNlQuery(req: NlQueryRequest): Promise<NlQueryResponse> {
  return apiClient.post<NlQueryResponse>('/ha-search/nl-query', req);
}

export async function getSavedQueries(): Promise<SavedQuery[]> {
  return apiClient.get<SavedQuery[]>('/ha-saved-queries');
}

export async function saveQuery(req: Omit<SavedQuery, 'id' | 'createdAt' | 'createdBy'>): Promise<SavedQuery> {
  return apiClient.post<SavedQuery>('/ha-saved-queries', req);
}

export async function deleteSavedQuery(id: string): Promise<void> {
  return apiClient.delete<void>(`/ha-saved-queries/${id}`);
}
