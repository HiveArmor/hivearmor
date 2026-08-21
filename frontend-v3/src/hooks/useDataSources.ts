/**
 * useDataSources — TanStack Query v5 hook for fetching data source status.
 *
 * Fetches all aggregated data source records from GET /api/ha-inputs/sources
 * and automatically refetches every 30 000 ms (Req 10.4).
 *
 * TanStack Query v5 cancels the refetch interval when the component that
 * owns this query unmounts, satisfying the "stop on navigate away" requirement
 * without any manual cleanup (Req 10.5).
 *
 * Security invariants:
 *   - This hook is mounted inside routes guarded by AuthGuard, so apiClient
 *     will always have a valid JWT from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access — apiClient handles JWT injection (Req 13.6).
 *   - No `any` types (Req 13.8).
 *
 * queryKey: ['dataSources']
 *
 * Requirements: 10.1, 10.4, 10.5, 13.6, 13.7, 13.8
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { dataSourcesService } from '@/services/dataSources.service';
import type { HaDataSourceRecord } from '@/types/dataSource.types';

// ---------------------------------------------------------------------------
// Shared query key — referenced by mutation hooks for cache invalidation
// (e.g. after AddDataSourceWizard POST /api/ha-inputs/sources, Req 11.5)
// ---------------------------------------------------------------------------

export const DATA_SOURCES_QUERY_KEY = ['dataSources'] as const;

/** Refetch interval in milliseconds — 30 seconds (Req 10.4). */
const REFETCH_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches the full aggregated list of data source records and keeps it
 * fresh with a 30-second background refetch interval.
 *
 * TanStack Query v5 automatically cancels the interval on component unmount,
 * so no manual cleanup is needed when the user navigates away (Req 10.5).
 *
 * @example
 * const { data, isPending, isError } = useDataSources();
 */
export function useDataSources(): UseQueryResult<HaDataSourceRecord[]> {
  return useQuery<HaDataSourceRecord[]>({
    queryKey: DATA_SOURCES_QUERY_KEY,
    queryFn: dataSourcesService.list,
    // Auto-refreshes every 30 s while the component is mounted (Req 10.4).
    // TanStack Query v5 stops the interval when the owning component unmounts,
    // so navigating away cancels the recurring refetch (Req 10.5).
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
