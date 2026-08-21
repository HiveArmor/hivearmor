/**
 * useAppConfig — Fetches the HiveArmor application configuration from the backend.
 *
 * Returns runtime flags such as `airGap` that are injected server-side via
 * `app.*` Spring properties and exposed through `GET /api/ha-config`.
 *
 * Components that need to adapt their behaviour to runtime config (e.g. the
 * "Sync Now" button in SigmaImportTab) consume this hook to read `airGap`.
 */

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';

export interface AppConfigDTO {
  /**
   * True when the platform is running in air-gap mode (`app.air-gap=true`).
   * In this mode all outbound internet connections are blocked and the Sigma
   * sync endpoint returns HTTP 409.
   */
  airGap: boolean;
}

async function getAppConfig(): Promise<AppConfigDTO> {
  return apiClient.get<AppConfigDTO>('/ha-config');
}

/**
 * TanStack Query hook that returns the current application config.
 * The result is stale-while-revalidate with a 5-minute cache — config rarely
 * changes at runtime, so frequent re-fetches are unnecessary.
 *
 * When the endpoint is unavailable (pre-T02 backend), the query falls back to
 * `{ airGap: false }` so that the UI degrades gracefully rather than
 * blocking the admin page.
 */
export function useAppConfig(): { airGap: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery<AppConfigDTO>({
    queryKey: ['app-config'],
    queryFn: getAppConfig,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Graceful degradation: treat backend errors as non-air-gap so the UI
    // remains functional even when the /ha-config endpoint is not yet deployed.
    retry: false,
    throwOnError: false,
  });

  return {
    airGap: data?.airGap ?? false,
    isLoading,
  };
}
