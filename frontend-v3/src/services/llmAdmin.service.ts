/**
 * llmAdmin.service.ts — LLM Admin API service (Sprint 27).
 *
 * Provides four fetch calls against `/api/ha-admin/llm/*` through the Vite proxy.
 * All requests carry `Authorization: Bearer <jwt>` sourced from localStorage —
 * never in the URL, query string, or fragment.
 *
 * SSE streaming for `pullModel` uses raw fetch + ReadableStream + TextDecoder
 * because the shared apiClient does not support event-stream responses.
 *
 * Requirements: 7.1, 7.2, 7.3, 9.4
 */

import type {
  LlmStatusDTO,
  LlmModelsDTO,
  LlmConfigUpdateDTO,
  OllamaPullProgress,
  HaLlmUsagePage,
  HaLlmUsageSummaryDTO,
} from '@/types/llmAdmin.types';
import { LlmAdminError } from '@/types/llmAdmin.types';

const BASE = '/api/ha-admin/llm';
const USAGE_BASE = '/api/ha-llm-usage';
const JWT_KEY = 'hivearmor_auth_token';

/**
 * Builds request headers with the Bearer JWT sourced from localStorage.
 * The token NEVER appears in the URL, query string, or fragment (Requirement 7.3).
 */
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(JWT_KEY) ?? '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export const llmAdminService = {
  /**
   * Returns the current LLM provider status.
   *
   * GET /api/ha-admin/llm/status → LlmStatusDTO
   *
   * Requirements: 7.1
   */
  getStatus: async (): Promise<LlmStatusDTO> => {
    const r = await fetch(`${BASE}/status`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!r.ok) throw new LlmAdminError(r.status);
    return r.json() as Promise<LlmStatusDTO>;
  },

  /**
   * Persists a new LLM provider configuration and triggers a hot-reload on the backend.
   *
   * POST /api/ha-admin/llm/config → 200 (no body)
   *
   * Requirements: 7.1
   */
  updateConfig: async (body: LlmConfigUpdateDTO): Promise<void> => {
    const r = await fetch(`${BASE}/config`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new LlmAdminError(r.status);
  },

  /**
   * Returns the list of models currently available in the Ollama registry.
   * Only valid when the active provider is "ollama"; otherwise the backend
   * returns HTTP 400.
   *
   * GET /api/ha-admin/llm/models → LlmModelsDTO
   *
   * Requirements: 7.1
   */
  listModels: async (): Promise<LlmModelsDTO> => {
    const r = await fetch(`${BASE}/models`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!r.ok) throw new LlmAdminError(r.status);
    return r.json() as Promise<LlmModelsDTO>;
  },

  /**
   * Initiates a model pull from the Ollama registry and yields one
   * `OllamaPullProgress` value per SSE frame until the stream ends.
   *
   * POST /api/ha-admin/llm/models/pull (text/event-stream)
   *
   * The response body is read via `getReader()` + `TextDecoder`. SSE frames
   * are delimited by double-newline (`\n\n`). Each `data:` payload is parsed
   * as JSON and yielded in the order received (Property 8).
   *
   * Only valid when the active provider is "ollama"; otherwise the backend
   * returns HTTP 400 and this function throws `LlmAdminError(400)`.
   *
   * Requirements: 7.2, 7.3
   */
  async *pullModel(model: string): AsyncGenerator<OllamaPullProgress> {
    const r = await fetch(`${BASE}/models/pull`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ model }),
    });

    if (!r.ok || !r.body) throw new LlmAdminError(r.ok ? 0 : r.status);

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      // SSE frames are separated by a blank line (\n\n)
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        // Strip the optional "data: " prefix and trim whitespace
        const payload = frame.replace(/^data:\s*/m, '').trim();
        if (!payload) continue;
        yield JSON.parse(payload) as OllamaPullProgress;
      }
    }

    // Flush any remaining buffered frame that wasn't terminated by \n\n
    const remaining = buf.replace(/^data:\s*/m, '').trim();
    if (remaining) {
      yield JSON.parse(remaining) as OllamaPullProgress;
    }
  },

  /**
   * Pageable durable LLM usage ledger (ADMIN). Safe fields only.
   *
   * GET /api/ha-llm-usage?page=&size=
   */
  listUsage: async (page = 0, size = 25): Promise<HaLlmUsagePage> => {
    const r = await fetch(`${USAGE_BASE}?page=${page}&size=${size}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!r.ok) throw new LlmAdminError(r.status);
    const totalHeader = r.headers.get('X-Total-Count');
    const totalCount = totalHeader !== null ? Number.parseInt(totalHeader, 10) : 0;
    const items = (await r.json()) as HaLlmUsagePage['items'];
    return { items, totalCount: Number.isFinite(totalCount) ? totalCount : 0 };
  },

  /**
   * Cascade-decision counts only.
   *
   * GET /api/ha-llm-usage/summary
   */
  getUsageSummary: async (): Promise<HaLlmUsageSummaryDTO[]> => {
    const r = await fetch(`${USAGE_BASE}/summary`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!r.ok) throw new LlmAdminError(r.status);
    return r.json() as Promise<HaLlmUsageSummaryDTO[]>;
  },
};
