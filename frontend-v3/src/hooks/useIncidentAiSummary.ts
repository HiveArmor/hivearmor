/**
 * useIncidentAiSummary hook (Sprint 25).
 *
 * Requirements: 17.1, 17.2, 17.4, 17.5
 */

import { useQuery } from '@tanstack/react-query';

import { aiChatService } from '@/services/aiChatService';
import type { AiIncidentSummary } from '@/types/ai.types';

/**
 * Fetches an AI-generated structured summary for the given incident.
 *
 * Results are cached for 1 hour (staleTime: 3_600_000 ms) and not retried
 * on failure.
 *
 * @param incidentId  The incident identifier (string form of the numeric PK)
 * @param enabled     When false (AI provider not configured), the query does not fire
 */
export function useIncidentAiSummary(incidentId: string, enabled: boolean) {
  return useQuery<AiIncidentSummary, Error>({
    queryKey: ['ai-incident-summary', incidentId],
    queryFn: () => aiChatService.generateIncidentSummary(incidentId),
    enabled: enabled && Boolean(incidentId),
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: false,
  });
}
