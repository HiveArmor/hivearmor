/**
 * useSystemSettings — TanStack Query v5 hook for fetching system settings.
 *
 * Fetches the full settings object from GET /api/ha-admin/settings.
 * The backend returns masked values ("***") for apiKey and smtp.password.
 *
 * Security invariants:
 *   - This hook is only mounted inside routes guarded by
 *     AuthGuard allowedRoles={['ROLE_ADMIN']}, so apiClient will always
 *     have a valid ROLE_ADMIN JWT injected from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access — apiClient handles JWT injection.
 *   - No `any` types (Req 13.8).
 *
 * queryKey: ['systemSettings']
 * staleTime: 30 seconds
 *
 * Requirements: 1.1, 1.3, 1.4, 13.6, 13.7, 13.8
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { systemSettingsService } from '@/services/systemSettings.service';
import type { SystemSettings } from '@/types/systemSettings.types';

// ---------------------------------------------------------------------------
// Shared query key
// ---------------------------------------------------------------------------

export const SYSTEM_SETTINGS_KEY = ['systemSettings'] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches all system settings with secrets masked.
 *
 * @example
 * const { data, isPending, isError } = useSystemSettings();
 */
export function useSystemSettings(): UseQueryResult<SystemSettings> {
  return useQuery<SystemSettings>({
    queryKey: SYSTEM_SETTINGS_KEY,
    queryFn: systemSettingsService.getSettings,
    staleTime: 30_000,
  });
}
