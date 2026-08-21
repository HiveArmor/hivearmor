/**
 * ruleGeneration.service.ts — Rule Generation API service (Sprint 28).
 *
 * Provides five fetch calls against `/api/ha-rules/*` through the Vite proxy.
 * All requests carry `Authorization: Bearer <jwt>` sourced exclusively from
 * localStorage key `hivearmor_auth_token` — never in the URL, query string,
 * or any other storage key.
 *
 * Requirements: 5.9, 5.10, 6.5, 6.6
 */

import type {
  RuleGenSessionDTO,
  SignalSummaryDTO,
  GenerateRequestDTO,
} from '@/types/ruleGeneration.types';
import { RuleGenerationError } from '@/types/ruleGeneration.types';

const BASE = '/api/ha-rules';
const TOKEN_KEY = 'hivearmor_auth_token';

/**
 * Builds request headers with the Bearer JWT sourced from localStorage.
 * The token NEVER appears in the URL, query string, or fragment (Requirement 6.6).
 */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

/**
 * Asserts the response is OK, otherwise throws a typed RuleGenerationError.
 */
async function assertOk<T>(r: Response): Promise<T> {
  if (!r.ok) throw new RuleGenerationError(r.status);
  return (await r.json()) as T;
}

export const ruleGenerationService = {
  /**
   * Fetches the aggregated signal summary for the rule generation page.
   *
   * GET /api/ha-rules/signals?minCount={minCount} → SignalSummaryDTO
   */
  getSignalSummary: async (minCount = 3): Promise<SignalSummaryDTO> => {
    const r = await fetch(`${BASE}/signals?minCount=${minCount}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    return assertOk<SignalSummaryDTO>(r);
  },

  /**
   * Fetches all sessions with status `pending_review`, ordered newest first.
   *
   * GET /api/ha-rules/sessions/pending → RuleGenSessionDTO[]
   */
  getPendingSessions: async (): Promise<RuleGenSessionDTO[]> => {
    const r = await fetch(`${BASE}/sessions/pending`, {
      method: 'GET',
      headers: authHeaders(),
    });
    return assertOk<RuleGenSessionDTO[]>(r);
  },

  /**
   * Generates a new rule suggestion session from accumulated signals.
   *
   * POST /api/ha-rules/sessions → RuleGenSessionDTO (status: pending_review)
   */
  generateSession: async (body: GenerateRequestDTO): Promise<RuleGenSessionDTO> => {
    const r = await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return assertOk<RuleGenSessionDTO>(r);
  },

  /**
   * Approves a pending session, writing the YAML to the output directory.
   *
   * POST /api/ha-rules/sessions/{id}/approve → RuleGenSessionDTO
   */
  approveSession: async (id: number): Promise<RuleGenSessionDTO> => {
    const r = await fetch(`${BASE}/sessions/${id}/approve`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return assertOk<RuleGenSessionDTO>(r);
  },

  /**
   * Rejects a pending session without writing any file.
   *
   * POST /api/ha-rules/sessions/{id}/reject → RuleGenSessionDTO
   */
  rejectSession: async (id: number): Promise<RuleGenSessionDTO> => {
    const r = await fetch(`${BASE}/sessions/${id}/reject`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return assertOk<RuleGenSessionDTO>(r);
  },

  /**
   * Rejects the current session and generates a new suggestion in one call.
   *
   * POST /api/ha-rules/sessions/{id}/regenerate → RuleGenSessionDTO
   */
  regenerateSession: async (
    id: number,
    body: GenerateRequestDTO,
  ): Promise<RuleGenSessionDTO> => {
    const r = await fetch(`${BASE}/sessions/${id}/regenerate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    return assertOk<RuleGenSessionDTO>(r);
  },
};
