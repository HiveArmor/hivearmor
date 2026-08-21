/**
 * Search Service — Saved Hunts
 * CRUD functions for HiveArmor saved hunt entries.
 * All requests route via the Vite /api/* proxy — no absolute backend URLs.
 */

import { apiClient } from '@/lib/apiClient';
import type { SavedHuntDTO } from '@/types/search';
import type { NlToDslResponse, SuggestedSearch } from '@/types/search.types';

const savedHuntFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Fetch all saved hunts visible to the current user
 * (own hunts + any marked isShared = true).
 * Issues GET /api/ha-saved-hunts.
 */
export async function getSavedHunts(): Promise<SavedHuntDTO[]> {
  if (savedHuntFixtureMode) {
    const { foundationSavedHunts } = await import('@/pages/search-hunt/searchHunt.fixtures');
    return foundationSavedHunts;
  }
  return apiClient.get<SavedHuntDTO[]>('/ha-saved-hunts');
}

/**
 * Create a new saved hunt.
 * Issues POST /api/ha-saved-hunts.
 * `id`, `createdBy`, and `createdAt` are assigned by the server.
 */
export async function createSavedHunt(
  data: Omit<SavedHuntDTO, 'id' | 'createdBy' | 'createdAt'>
): Promise<SavedHuntDTO> {
  if (savedHuntFixtureMode) {
    return { ...data, id: Date.now(), createdBy: 'maya.chen', createdAt: new Date().toISOString() };
  }
  return apiClient.post<SavedHuntDTO>('/ha-saved-hunts', data);
}

/**
 * Update an existing saved hunt by id.
 * Issues PUT /api/ha-saved-hunts/{id}.
 * Returns 404 when the caller is not the owner and does not hold ADMIN.
 */
export async function updateSavedHunt(
  id: number,
  data: Partial<SavedHuntDTO>
): Promise<SavedHuntDTO> {
  if (savedHuntFixtureMode) {
    const { foundationSavedHunts } = await import('@/pages/search-hunt/searchHunt.fixtures');
    const existing = foundationSavedHunts.find((hunt) => hunt.id === id);
    if (!existing) throw new Error('Saved hunt not found');
    return { ...existing, ...data };
  }
  return apiClient.put<SavedHuntDTO>(`/ha-saved-hunts/${id}`, data);
}

/**
 * Delete a saved hunt by id.
 * Issues DELETE /api/ha-saved-hunts/{id}.
 * Returns 404 when the caller is not the owner and does not hold ADMIN.
 */
export async function deleteSavedHunt(id: number): Promise<void> {
  if (savedHuntFixtureMode) return Promise.resolve();
  return apiClient.delete<void>(`/ha-saved-hunts/${id}`);
}

// ---------------------------------------------------------------------------
// Natural Language Search (Sprint 26)
// All requests carry the JWT from localStorage in the Authorization header only —
// never in the URL path, query string, or fragment (NoJwtInUrlInvariant).
// ---------------------------------------------------------------------------

const NL_SEARCH_JWT_KEY = 'hivearmor_auth_token';
const HA_SEARCH_BASE = '/api/ha-search';

/**
 * Builds auth headers for the NL search endpoints.
 * The token NEVER appears in the URL, query string, or fragment.
 */
function nlSearchAuthHeaders(): HeadersInit {
  const token = window.localStorage.getItem(NL_SEARCH_JWT_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Translates a natural-language query to an OpenSearch DSL object.
 *
 * Issues POST /api/ha-search/nl-to-dsl with the JWT in the Authorization
 * header. Throws on any non-2xx response.
 *
 * Requirements: 7.1, 7.2, 7.5, 7.7, 7.8, 16.3, 16.4
 */
export async function translateNlToDsl(
  query: string,
  indexPattern: string,
): Promise<NlToDslResponse> {
  const response = await fetch(`${HA_SEARCH_BASE}/nl-to-dsl`, {
    method: 'POST',
    headers: nlSearchAuthHeaders(),
    body: JSON.stringify({ query, indexPattern }),
  });
  if (!response.ok) {
    throw new Error(`translateNlToDsl failed: ${response.status}`);
  }
  return response.json() as Promise<NlToDslResponse>;
}

/**
 * Fetches AI-suggested searches for the given index pattern.
 *
 * Issues GET /api/ha-search/suggestions with the JWT in the Authorization
 * header. The JWT is NEVER placed in the URL, query string, or fragment
 * (NoJwtInUrlInvariant). Throws on any non-2xx response.
 *
 * Requirements: 7.3, 7.6, 7.7, 7.8, 16.3, 16.4
 */
export async function getSuggestions(
  indexPattern: string,
  count?: number,
): Promise<SuggestedSearch[]> {
  const params = new URLSearchParams({ indexPattern });
  if (count !== undefined) {
    params.set('count', String(count));
  }
  const token = window.localStorage.getItem(NL_SEARCH_JWT_KEY);
  const response = await fetch(`${HA_SEARCH_BASE}/suggestions?${params.toString()}`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`getSuggestions failed: ${response.status}`);
  }
  return response.json() as Promise<SuggestedSearch[]>;
}
