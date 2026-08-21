/**
 * useAiTriage and useAiStatus hooks (Sprint 25).
 *
 * Requirements: 13.1, 13.2, 13.3, 6.4
 */

import { useQuery } from '@tanstack/react-query';

import { aiChatService } from '@/services/aiChatService';
import type { AiTriageResult, AiStatusResponse } from '@/types/ai.types';

/**
 * Fetches an AI triage summary for the given alert.
 *
 * Results are cached for 1 hour (staleTime: 3_600_000 ms) and not retried
 * on failure so that a disabled LLM provider surfaces immediately.
 *
 * @param alertId  The alert identifier
 * @param enabled  When false (AI provider not configured), the query does not fire
 */
export function useAiTriage(alertId: string, enabled: boolean) {
  return useQuery<AiTriageResult, Error>({
    queryKey: ['ai-triage', alertId],
    queryFn: () => aiChatService.generateTriage(alertId),
    enabled: enabled && Boolean(alertId),
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: false,
  });
}

/**
 * Fetches the current AI provider status.
 *
 * Cached for 5 minutes. Used to gate AI surfaces — when `configured` is false,
 * triage and summary components render nothing.
 */
export function useAiStatus() {
  return useQuery<AiStatusResponse, Error>({
    queryKey: ['ai-status'],
    queryFn: () => aiChatService.getAiStatus(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}
