/**
 * useApiKeys — TanStack Query v5 hook for fetching the API key list.
 *
 * Fetches all API key records from GET /api/ha-admin/api-keys.
 * Records never include the plaintext token or bcrypt hash (Req 5.5, 5.6).
 *
 * Security invariants:
 *   - This hook is only mounted inside routes guarded by
 *     AuthGuard allowedRoles={['ROLE_ADMIN']}, so apiClient will always
 *     have a valid ROLE_ADMIN JWT injected from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access — apiClient handles JWT injection.
 *   - No `any` types (Req 13.8).
 *
 * queryKey: ['apiKeys']
 *
 * Requirements: 7.1, 13.6, 13.7, 13.8
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { apiKeysService } from '@/services/apiKeys.service';
import type { HaApiKeyRecord } from '@/types/apiKey.types';

// ---------------------------------------------------------------------------
// Shared query key — referenced by mutation hooks for cache invalidation
// ---------------------------------------------------------------------------

export const API_KEYS_QUERY_KEY = ['apiKeys'] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the full list of API key records.
 * Never includes the plaintext token or bcrypt hash.
 *
 * @example
 * const { data, isPending, isError } = useApiKeys();
 */
export function useApiKeys(): UseQueryResult<HaApiKeyRecord[]> {
  return useQuery<HaApiKeyRecord[]>({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: apiKeysService.list,
  });
}
