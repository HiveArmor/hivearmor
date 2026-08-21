/**
 * TanStack Query hook for the HiveArmor Search & Hunt Timeline tab.
 * Fetches timeline events from GET /api/ha-search/timeline.
 *
 * Auth: routed through apiClient which injects Authorization: Bearer <hivearmor_auth_token>.
 * Do NOT read localStorage directly in this hook.
 */

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import type { TimelineEventDTO } from '@/types/search';

/**
 * Fetches up to 500 timeline events for the given query and time window.
 *
 * queryKey shape (fixed — property-tested by Task 3.8):
 *   ['search-timeline', query, from.toISOString(), to.toISOString()]
 *
 * The hook is disabled when `query` is blank to avoid unnecessary backend calls.
 */
export function useSearchTimeline(query: string, from: Date, to: Date): ReturnType<
  typeof useQuery<TimelineEventDTO[]>
> {
  return useQuery<TimelineEventDTO[]>({
    queryKey: ['search-timeline', query, from.toISOString(), to.toISOString()],
    queryFn: () =>
      apiClient.get<TimelineEventDTO[]>(
        `/ha-search/timeline?query=${encodeURIComponent(query)}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
}
