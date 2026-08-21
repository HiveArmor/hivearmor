/**
 * TanStack Query v5 hook for the UEBA Entity Timeline.
 *
 * Fetches the entity timeline dataset for a specific user from
 * GET /api/ha-ueba/entity-timeline?userId=...
 *
 * Auth is routed through apiClient which injects
 * Authorization: Bearer <hivearmor_auth_token>.
 */

import { useQuery } from '@tanstack/react-query';

import { getEntityTimeline } from '@/services/ueba.service';
import type { EntityTimelineResponse } from '@/types/ueba.types';

/**
 * Fetches the entity timeline scatter chart data for the given user.
 *
 * queryKey shape: ['ueba', 'entity-timeline', userId]
 *
 * @param userId - The user identifier to fetch the timeline for.
 * @returns The raw TanStack Query result with `data` typed as `EntityTimelineResponse`.
 */
export function useEntityTimeline(userId: string) {
  return useQuery<EntityTimelineResponse, Error>({
    queryKey: ['ueba', 'entity-timeline', userId],
    queryFn: () => getEntityTimeline(userId),
    enabled: userId.length > 0,
    staleTime: 30_000,
  });
}
