/**
 * useUpdateAiSettings — TanStack Query v5 mutation hook for PUT /api/ha-admin/settings/ai.
 *
 * Sends the AI/LLM settings payload to the backend, which will:
 *   1. Persist the new settings (encrypting apiKey at rest).
 *   2. Publish a LlmConfigChangedEvent → triggers HaLlmService.reloadClient().
 *
 * On success, invalidates the ['systemSettings'] query key so the settings
 * panel refreshes automatically with the updated (masked) values.
 *
 * apiKeyTouched semantics (Req 1.6 / 2.7):
 *   - The caller sets apiKeyTouched=true only when the user has changed the
 *     apiKey input field away from the value originally delivered by GET.
 *   - When apiKeyTouched=false the backend ignores the apiKey field in the
 *     request body and preserves the stored key.
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 1.3, 1.4, 1.5, 1.6, 2.7, 13.6, 13.7, 13.8
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { SYSTEM_SETTINGS_KEY } from '@/hooks/useSystemSettings';
import { systemSettingsService } from '@/services/systemSettings.service';
import type { SystemSettingsAi } from '@/types/systemSettings.types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook for updating AI/LLM settings.
 *
 * @example
 * const { mutate, isPending } = useUpdateAiSettings();
 * mutate({ provider, model, endpoint, apiKey, apiKeyTouched });
 */
export function useUpdateAiSettings(): UseMutationResult<
  SystemSettingsAi,
  Error,
  SystemSettingsAi
> {
  const queryClient = useQueryClient();

  return useMutation<SystemSettingsAi, Error, SystemSettingsAi>({
    mutationFn: (payload: SystemSettingsAi) =>
      systemSettingsService.updateAiSettings(payload),
    onSuccess: () => {
      // Refresh the settings panel so it shows the updated (masked) values.
      void queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_KEY });
    },
  });
}
