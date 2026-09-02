/**
 * useUpdateGeneralSettings — TanStack Query v5 mutation hook for
 * PUT /api/ha-admin/settings/general.
 *
 * Sends the General settings payload (siteName, timezone, defaultLocale) to the
 * backend. On success, invalidates the ['systemSettings'] query key so the
 * settings panel refreshes automatically with the updated values.
 *
 * Security invariants:
 *   - apiClient injects JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this hook.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 1.2, 3.1, 13.6, 13.7, 13.8
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { SYSTEM_SETTINGS_KEY } from '@/hooks/useSystemSettings';
import { systemSettingsService } from '@/services/systemSettings.service';
import type { SystemSettingsGeneral } from '@/types/systemSettings.types';

/**
 * Mutation hook for updating General settings.
 *
 * @example
 * const { mutate, isPending } = useUpdateGeneralSettings();
 * mutate({ siteName, timezone, defaultLocale });
 */
export function useUpdateGeneralSettings(): UseMutationResult<
  SystemSettingsGeneral,
  Error,
  SystemSettingsGeneral
> {
  const queryClient = useQueryClient();

  return useMutation<SystemSettingsGeneral, Error, SystemSettingsGeneral>({
    mutationFn: (payload: SystemSettingsGeneral) =>
      systemSettingsService.updateGeneralSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_KEY });
    },
  });
}
