/**
 * TanStack Query v5 hook for the HiveArmor File Integrity Monitoring Dashboard.
 *
 * Fetches the FIM summary (changes over time, top changed paths, suspicious hashes)
 * from GET /api/ha-edr/fim/summary.
 *
 * The hook is disabled when `query` is null to allow conditional usage from parent
 * components that may not yet have a selected time range or agent filter.
 *
 * Auth: routed through apiClient which injects Authorization: Bearer <hivearmor_auth_token>.
 * Do NOT read localStorage directly in this hook.
 */

import { useQuery } from '@tanstack/react-query';

import { fetchFimSummary } from '@/services/edrService';
import type { FimSummaryQuery, FimSummaryDTO } from '@/types/edr';

/**
 * Fetches the FIM summary for the given time window and optional filters.
 *
 * queryKey shape: ['fim-summary', query]
 *
 * @param query - FIM summary query parameters, or null to disable the query.
 * @returns The raw TanStack Query result with `data` typed as `FimSummaryDTO`.
 */
export function useFimSummary(query: FimSummaryQuery | null) {
  return useQuery<FimSummaryDTO>({
    queryKey: ['fim-summary', query],
    queryFn: () => fetchFimSummary(query as FimSummaryQuery),
    enabled: query !== null,
    staleTime: 60_000,
  });
}
