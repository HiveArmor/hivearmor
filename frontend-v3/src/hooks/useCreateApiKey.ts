/**
 * useCreateApiKey — TanStack Query v5 mutation hook for POST /api/ha-admin/api-keys.
 *
 * Creates a new API key. On success the response contains the plaintext token
 * exactly once (Req 5.4). The hook invalidates the ['apiKeys'] query key so
 * the list refreshes automatically.
 *
 * Token handling contract (Req 7.3, 7.4):
 *   - The plaintext token lives only in the onSuccess callback and in the
 *     component's local useState. It MUST NOT be stored in Zustand or localStorage.
 *   - The component MUST display the token in a copy dialog and clear it from
 *     state when the user acknowledges.
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 7.1, 7.3, 7.4, 13.6, 13.7, 13.8
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { API_KEYS_QUERY_KEY } from '@/hooks/useApiKeys';
import { apiKeysService } from '@/services/apiKeys.service';
import type { HaApiKeyCreatePayload, HaApiKeyCreatedResponse } from '@/types/apiKey.types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for creating a new API key.
 *
 * @example
 * const { mutate, isPending } = useCreateApiKey();
 * mutate({ name, scopes, expiresAt }, {
 *   onSuccess: (created) => setToken(created.token),
 * });
 */
export function useCreateApiKey(): UseMutationResult<
  HaApiKeyCreatedResponse,
  Error,
  HaApiKeyCreatePayload
> {
  const queryClient = useQueryClient();

  return useMutation<HaApiKeyCreatedResponse, Error, HaApiKeyCreatePayload>({
    mutationFn: (payload: HaApiKeyCreatePayload) => apiKeysService.create(payload),
    onSuccess: () => {
      // Refresh the key list so the newly created record appears immediately.
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}
