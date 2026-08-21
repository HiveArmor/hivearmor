/**
 * TanStack Query v5 hook for the HiveArmor Endpoint Timeline.
 *
 * Fetches a paginated list of EDR events from GET /api/ha-edr/timeline.
 *
 * The hook is disabled when `query` is null to allow conditional usage from
 * parent components that may not yet have a selected agent or time range.
 *
 * `placeholderData` preserves the previous page while a new page loads,
 * preventing flickering during pagination.
 *
 * Auth: routed through apiClient which injects Authorization: Bearer <hivearmor_auth_token>.
 * Do NOT read localStorage directly in this hook.
 */

import { useQuery } from '@tanstack/react-query';

import { fetchEdrTimeline } from '@/services/edrService';
import type { EdrTimelineQuery, EdrTimelinePage } from '@/types/edr';

/**
 * Fetches a paginated EDR timeline for the given agent, time range, and filters.
 *
 * queryKey shape: ['edr-timeline', query]
 *
 * @param query - Timeline query parameters, or null to disable the query.
 * @returns The raw TanStack Query result with `data` typed as `EdrTimelinePage`.
 */
export function useEdrTimeline(query: EdrTimelineQuery | null) {
  return useQuery<EdrTimelinePage>({
    queryKey: ['edr-timeline', query],
    queryFn: () => fetchEdrTimeline(query as EdrTimelineQuery),
    enabled: query !== null,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}
