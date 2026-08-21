/**
 * TanStack Query v5 hooks for the HiveArmor SCIM 2.0 token lifecycle admin UI.
 *
 * - useScimTokenStatus    — fetches the current SCIM bearer-token status
 * - useGenerateScimToken  — generates a new SCIM bearer token (returned exactly once)
 * - useRevokeScimToken    — revokes the current SCIM bearer token
 *
 * Both mutation hooks invalidate the ['scim-token-status'] query key on success so
 * that the status display refreshes automatically after every write operation.
 *
 * Security invariants:
 *   - The plaintext SCIM token returned by useGenerateScimToken is NEVER passed to
 *     console.log, console.warn, console.error, console.debug, or any logger.
 *     Callers must show it once via a modal and discard it (HiveArmor platform
 *     invariant 5.10 / requirement 7.10).
 *   - All requests route through apiClient which injects Authorization: Bearer.
 *     Do NOT read localStorage directly in these hooks.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import {
  fetchScimTokenStatus,
  generateScimToken,
  revokeScimToken,
} from '@/services/scimAdminService';
import type { ScimTokenGenerateResponse, ScimTokenStatus } from '@/types/scim';

// ---------------------------------------------------------------------------
// Shared query key
// ---------------------------------------------------------------------------

const SCIM_TOKEN_STATUS_KEY = ['scim-token-status'] as const;

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

/**
 * Fetches the current SCIM bearer-token status.
 *
 * queryKey: ['scim-token-status']
 * staleTime: 30 seconds
 *
 * Returns whether a token hash is configured and the ISO-8601 timestamp of
 * the last successful SCIM request (or null if the token has never been used).
 *
 * The plaintext token is NEVER included in the status response per HiveArmor
 * platform invariant 5.4.
 *
 * @returns TanStack Query result with `data` typed as `ScimTokenStatus`.
 */
export function useScimTokenStatus(): UseQueryResult<ScimTokenStatus> {
  return useQuery<ScimTokenStatus>({
    queryKey: SCIM_TOKEN_STATUS_KEY,
    queryFn: fetchScimTokenStatus,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Generate mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that generates a new SCIM bearer token.
 *
 * On success, invalidates the ['scim-token-status'] query key so the token
 * status display refreshes automatically.
 *
 * ⚠ The returned `ScimTokenGenerateResponse.token` value MUST NEVER be passed
 *   to console.log, console.warn, console.error, console.debug, or any logger.
 *   Display it once via a modal and let the user copy it — then discard it.
 *
 * @example
 * const { mutate, data } = useGenerateScimToken();
 * mutate();
 * // data?.token → show once in modal, never log
 */
export function useGenerateScimToken(): UseMutationResult<
  ScimTokenGenerateResponse,
  Error,
  void
> {
  const queryClient = useQueryClient();

  return useMutation<ScimTokenGenerateResponse, Error, void>({
    mutationFn: generateScimToken,
    onSuccess: () => {
      // ⚠ Do NOT pass the token value to any logger here or in calling code.
      void queryClient.invalidateQueries({ queryKey: SCIM_TOKEN_STATUS_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Revoke mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that revokes the current SCIM bearer token.
 *
 * The backend clears the SCIM_BEARER_TOKEN_HASH configuration parameter so
 * that all subsequent SCIM requests return HTTP 401 until a new token is
 * generated via useGenerateScimToken.
 *
 * On success, invalidates the ['scim-token-status'] query key so the token
 * status display refreshes automatically.
 *
 * @example
 * const { mutate } = useRevokeScimToken();
 * mutate();
 */
export function useRevokeScimToken(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: revokeScimToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCIM_TOKEN_STATUS_KEY });
    },
  });
}
