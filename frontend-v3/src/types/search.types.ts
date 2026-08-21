/**
 * Natural Language Search — shared TypeScript types (Sprint 26).
 * Zero `any` types. All enumerations use union literals.
 */

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface NlToDslRequest {
  query: string;
  indexPattern: string;
}

export interface NlToDslResponse {
  dsl: string;
  explanation: string;
  confidence: number;
}

export interface SuggestedSearch {
  label: string;
  dsl: string;
  description: string;
}

/**
 * Maps a confidence score in [0, 1] to a ConfidenceBand.
 * Thresholds: >= 0.75 → 'high', >= 0.4 → 'medium', < 0.4 → 'low'.
 */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}
