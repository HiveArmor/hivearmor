/**
 * useRevokeApiKey — TanStack Query v5 mutation hook for DELETE /api/ha-admin/api-keys/{id}.
 *
 * Revokes an API key by id. The backend sets revokedAt to the current server
 * time and returns HTTP 204 (Req 6.4). On success the hook invalidates the
 * ['apiKeys'] query key so the list refreshes and shows the updated status
 * (Req 7.5).
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 7.5, 13.6, 13.7, 13.8
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { API_KEYS_QUERY_KEY } from '@/hooks/useApiKeys';
import { apiKeysService } from '@/services/apiKeys.service';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for revoking an API key.
 * Accepts the key's UUID string as the mutation variable.
 *
 * @example
 * const { mutate, isPending } = useRevokeApiKey();
 * mutate(keyId);
 */
export function useRevokeApiKey(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => apiKeysService.revoke(id),
    onSuccess: () => {
      // Invalidate the list so the revoked key's status updates to "revoked".
      void queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });
}
