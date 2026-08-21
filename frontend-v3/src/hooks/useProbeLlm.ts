/**
 * useProbeLlm — TanStack Query v5 mutation hook for POST /api/ha-admin/settings/ai/test.
 *
 * Issues a live probe against the currently configured LLM endpoint.
 * The backend sanitizes any error messages — the persisted apiKey is NEVER
 * included in the response body or in any log statement (Req 2.6 / 3.5).
 *
 * Response shape:
 *   - Success: { ok: true,  latencyMs: number }
 *   - Failure: { ok: false, error: string }   (sanitized message)
 *
 * This is modelled as a mutation (not a query) because it is a side-effecting
 * call that the user explicitly triggers — not a background refetch.
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 1.3, 2.5, 2.6, 13.6, 13.7, 13.8
 */

import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { systemSettingsService } from '@/services/systemSettings.service';
import type { LlmProbeResult } from '@/types/systemSettings.types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for probing the currently configured LLM endpoint.
 *
 * @example
 * const { mutate, data, isPending } = useProbeLlm();
 * // Trigger the probe:
 * mutate();
 * // Inspect the result:
 * if (data?.ok) { ... } else { console.warn(data?.error); }
 */
export function useProbeLlm(): UseMutationResult<LlmProbeResult, Error, void> {
  return useMutation<LlmProbeResult, Error, void>({
    mutationFn: systemSettingsService.probeLlm,
  });
}
