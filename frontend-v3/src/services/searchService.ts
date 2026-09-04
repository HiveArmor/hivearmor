/**
 * Search Service — Natural Language Search (Sprint 26)
 *
 * NL→DSL translation and AI-suggested searches, routed via the Vite /api/* proxy.
 * The retired `/ha-saved-hunts` CRUD was removed in the Hunt Phase-A consolidation
 * (saved queries are unified on `/ha-hunts/saved` in searchHunt.service.ts).
 *
 * All requests carry the JWT from localStorage in the Authorization header only —
 * never in the URL path, query string, or fragment (NoJwtInUrlInvariant).
 */

import type { NlToDslResponse, SuggestedSearch } from '@/types/search.types';

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
