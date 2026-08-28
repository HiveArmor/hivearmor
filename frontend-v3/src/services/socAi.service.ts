/**
 * socAi.service.ts — Assistive SOC AI (STAGING CANDIDATE)
 *
 * Confirmed path: POST /api/ha-soc-ai/query
 * Never call /api/ha-ai/query. Never silent mutates — Q&A only.
 * When SOC_AI_BASE_URL is unset, backend returns a graceful 200 fallback
 * (confidence 0, empty sources) — UI must treat that as honesty, not success.
 */

import { apiClient, ApiError } from '@/lib/apiClient';
import type { IntelligenceFindingDTO } from '@/types/intelligenceFinding.types';

/** Roles allowed to call SOC AI (matches backend @PreAuthorize). */
export const SOC_AI_QUERY_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
  'ROLE_ANALYST',
] as const;

/** STAGING CANDIDATE — not PRODUCTION READY / LIVE VERIFIED. */
export const SOC_AI_ASSISTIVE_ONLY = true;

export interface SocAiQueryRequest {
  prompt: string;
  context?: string;
  /** When true, backend persists the structured finding (optional HI-04). */
  persist?: boolean;
}

export interface SocAiQueryResponse {
  answer: string;
  confidence: number;
  sources: string[];
  durationMs: number;
  finding: IntelligenceFindingDTO;
}

export function canQuerySocAi(roles: readonly string[]): boolean {
  return SOC_AI_QUERY_ROLES.some((role) => roles.includes(role));
}

/**
 * Detect backend "not configured" / unavailable fallback answers.
 * Backend returns HTTP 200 with confidence 0 and explanatory answer text.
 */
export function isSocAiUnavailableAnswer(response: SocAiQueryResponse): boolean {
  if (response.confidence <= 0 && response.sources.length === 0) {
    const lower = response.answer.toLowerCase();
    return (
      lower.includes('not configured') ||
      lower.includes('unavailable') ||
      lower.includes('set soc_ai_base_url')
    );
  }
  return false;
}

export function formatSocAiHttpHonesty(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return 'SOC AI is unavailable (HTTP 503). Assistive Q&A is STAGING CANDIDATE until the service is configured.';
    }
    if (error.status === 403) {
      return 'Required permission: Analyst, SOC Manager, or Platform Administrator.';
    }
    return `SOC AI request failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'SOC AI request failed.';
}

export const socAiService = {
  query: (request: SocAiQueryRequest, signal?: AbortSignal) =>
    apiClient.post<SocAiQueryResponse>('/ha-soc-ai/query', request, { signal }),
};
