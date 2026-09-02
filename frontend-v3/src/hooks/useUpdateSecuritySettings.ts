/**
 * useUpdateSecuritySettings — TanStack Query v5 mutation hook for
 * PUT /api/ha-admin/settings/security.
 *
 * Sends the Security settings payload (sessionTimeoutMinutes, mfaRequired,
 * passwordMinLength) to the backend. On success, invalidates the
 * ['systemSettings'] query key so the settings panel refreshes automatically.
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 1.2, 3.3, 13.6, 13.7, 13.8
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { SYSTEM_SETTINGS_KEY } from '@/hooks/useSystemSettings';
import { systemSettingsService } from '@/services/systemSettings.service';
import type { SystemSettingsSecurity } from '@/types/systemSettings.types';

/**
 * Mutation hook for updating Security settings.
 *
 * @example
 * const { mutate, isPending } = useUpdateSecuritySettings();
 * mutate({ sessionTimeoutMinutes, mfaRequired, passwordMinLength });
 */
export function useUpdateSecuritySettings(): UseMutationResult<
  SystemSettingsSecurity,
  Error,
  SystemSettingsSecurity
> {
  const queryClient = useQueryClient();

  return useMutation<SystemSettingsSecurity, Error, SystemSettingsSecurity>({
    mutationFn: (payload: SystemSettingsSecurity) =>
      systemSettingsService.updateSecuritySettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_KEY });
    },
  });
}
