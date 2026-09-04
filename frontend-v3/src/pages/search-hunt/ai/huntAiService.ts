/**
 * Hunt AI Service — the ONLY module the UI imports for the AI-analysis layer.
 *
 * Contract-first: the UI never branches on mode. `mock` returns fixtures shaped to
 * huntAiContract.types.ts; `live` calls the frozen /api/ha-hunts/ai/* endpoints.
 * Flipping HUNT_AI_MODE (env-gated, mirrors VITE_USE_FOUNDATION_FIXTURES) is the
 * only switch — zero UI changes when the backend lands honoring the contract.
 */

import type {
  HuntAiMode,
  HuntVerdictRequest,
  HuntVerdictResponse,
  HuntFieldProvenance,
  HuntClauseExplanation,
  HuntAiFeedback,
} from './huntAiContract.types';

import { apiClient } from '@/lib/apiClient';


/** Mock until the Triage/verdict agent backend ships (REDESIGN §5.1, contract-first). */
export const HUNT_AI_MODE: HuntAiMode =
  import.meta.env.VITE_HUNT_AI_MODE === 'live' ? 'live' : 'mock';

const AI_BASE = '/ha-hunts/ai';

/** Verdict + reasoning + evidence + calibration over a completed search's result set. */
export async function fetchHuntVerdict(req: HuntVerdictRequest): Promise<HuntVerdictResponse> {
  if (HUNT_AI_MODE === 'mock') {
    const { MOCK_VERDICT } = await import('./huntAiContract.fixtures');
    // Echo the searchId so the mock reads as scoped to the live search.
    return { ...MOCK_VERDICT, verdictId: `${MOCK_VERDICT.verdictId}-${req.searchId}` };
  }
  return apiClient.post<HuntVerdictResponse>(`${AI_BASE}/verdict`, req);
}

/** Which result fields are model-derived vs raw (move 2: "show AI's hand"). */
export async function fetchFieldProvenance(searchId: string): Promise<HuntFieldProvenance[]> {
  if (HUNT_AI_MODE === 'mock') {
    const { MOCK_FIELD_PROVENANCE } = await import('./huntAiContract.fixtures');
    return MOCK_FIELD_PROVENANCE;
  }
  return apiClient.get<HuntFieldProvenance[]>(`${AI_BASE}/provenance?searchId=${encodeURIComponent(searchId)}`);
}

/** Ambient plain-language gloss of a DSL clause (move 5). */
export async function explainClause(clause: string): Promise<HuntClauseExplanation> {
  if (HUNT_AI_MODE === 'mock') {
    const { mockExplainClause } = await import('./huntAiContract.fixtures');
    return mockExplainClause(clause);
  }
  return apiClient.post<HuntClauseExplanation>(`${AI_BASE}/explain`, { clause, language: 'kql' });
}

/** 👍/👎 (and optional correction) — feeds the calibration loop. */
export async function submitAiFeedback(feedback: HuntAiFeedback): Promise<{ recorded: true }> {
  if (HUNT_AI_MODE === 'mock') {
    // eslint-disable-next-line no-console
    console.info('[hunt-ai mock] feedback recorded', feedback);
    return { recorded: true };
  }
  return apiClient.post<{ recorded: true }>(`${AI_BASE}/feedback`, feedback);
}
