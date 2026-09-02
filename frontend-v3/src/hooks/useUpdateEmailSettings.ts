/**
 * useUpdateEmailSettings — TanStack Query v5 mutation hook for
 * PUT /api/ha-admin/settings/email.
 *
 * Sends the Email/SMTP settings payload (host, port, username, password, from,
 * useTls) to the backend. On success, invalidates the ['systemSettings'] query
 * key so the settings panel refreshes automatically with the updated (masked)
 * values.
 *
 * Secret semantics (mirror AiLlmTab apiKey):
 *   - The caller only sends a real password value when the user has edited the
 *     password field. When left untouched it sends the masked sentinel "***",
 *     which the backend treats as "preserve the stored password".
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 1.2, 3.2, 13.6, 13.7, 13.8
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { SYSTEM_SETTINGS_KEY } from '@/hooks/useSystemSettings';
import { systemSettingsService } from '@/services/systemSettings.service';
import type { SystemSettingsEmail } from '@/types/systemSettings.types';

/**
 * Mutation hook for updating Email/SMTP settings.
 *
 * @example
 * const { mutate, isPending } = useUpdateEmailSettings();
 * mutate({ host, port, username, password, from, useTls });
 */
export function useUpdateEmailSettings(): UseMutationResult<
  SystemSettingsEmail,
  Error,
  SystemSettingsEmail
> {
  const queryClient = useQueryClient();

  return useMutation<SystemSettingsEmail, Error, SystemSettingsEmail>({
    mutationFn: (payload: SystemSettingsEmail) =>
      systemSettingsService.updateEmailSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_KEY });
    },
  });
}
