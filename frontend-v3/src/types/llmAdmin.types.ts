/**
 * llmAdmin.types.ts — LLM Admin API TypeScript types (Sprint 27).
 *
 * These shapes mirror the backend DTOs under
 * com.hivearmor.web.rest.admin.HaLlmAdminResource exactly.
 *
 * Invariants:
 *   - Zero `any` types — all shapes are fully typed.
 *   - LlmConfigUpdateDTO.provider is a closed union literal.
 *   - Nullable numeric fields use `number | null` (not `undefined`), matching
 *     the JSON wire format where the backend serialises null explicitly.
 *
 * Requirements: 7.1, 9.4
 */

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Response from GET /api/ha-admin/llm/status.
 *
 * - configured: true when the active provider is reachable.
 * - provider: stable identifier — "disabled" | "openai" | "azure" | "ollama".
 * - latencyMs: last health-probe round-trip in milliseconds; null when the
 *   provider has never been probed or is disabled.
 */
export interface LlmStatusDTO {
  configured: boolean;
  provider: string;
  latencyMs: number | null;
}

// ── Models ────────────────────────────────────────────────────────────────────

/**
 * A single model entry as returned by the Ollama /api/tags endpoint.
 */
export interface OllamaModel {
  /** Model name as registered in Ollama (e.g. "llama3.2:3b"). */
  name: string;
  /** Human-readable disk size (e.g. "2.0 GB"). */
  size: string;
  /** SHA-256 digest of the model blob. */
  digest: string;
  /** ISO-8601 timestamp of when the model was last modified. */
  modifiedAt: string;
}

/**
 * Response from GET /api/ha-admin/llm/models.
 * Only returned when the active provider is "ollama"; otherwise HTTP 400.
 */
export interface LlmModelsDTO {
  /** Active provider name — always "ollama" when this response is returned. */
  provider: string;
  models: OllamaModel[];
}

// ── Pull progress ─────────────────────────────────────────────────────────────

/**
 * One SSE frame yielded by POST /api/ha-admin/llm/models/pull.
 *
 * - total and completed are null until Ollama reports byte counts.
 * - digest is null on early progress frames (status == "pulling manifest").
 */
export interface OllamaPullProgress {
  /** Human-readable pull status (e.g. "pulling manifest", "downloading", "success"). */
  status: string;
  /** Total bytes to download; null until the manifest is resolved. */
  total: number | null;
  /** Bytes downloaded so far; null until the manifest is resolved. */
  completed: number | null;
  /** Layer digest being pulled; null on non-layer frames. */
  digest: string | null;
}

// ── Config update ─────────────────────────────────────────────────────────────

/**
 * Request body for POST /api/ha-admin/llm/config.
 *
 * All optional fields may be omitted; the backend preserves the last-known
 * value for any field absent from the payload.
 */
export interface LlmConfigUpdateDTO {
  /** Active provider selection — closed union matching backend @Pattern. */
  provider: 'disabled' | 'openai' | 'azure' | 'ollama';
  /** Provider base URL (e.g. "http://ollama:11434" for Ollama). Max 512 chars. */
  baseUrl?: string;
  /** Model identifier (e.g. "llama3.2:3b", "gpt-4o"). Max 128 chars. */
  model?: string;
  /** Provider API key. Max 4096 chars. */
  apiKey?: string;
  /** Sampling temperature in [0.0, 2.0]. */
  temperature?: number;
  /** Maximum response tokens in [1, 32768]. */
  maxTokens?: number;
}

// ── Pull request ──────────────────────────────────────────────────────────────

/**
 * Request body for POST /api/ha-admin/llm/models/pull.
 */
export interface PullRequestDTO {
  /** Model name to pull from the Ollama registry. Max 128 chars. */
  model: string;
}

// ── Usage ledger (read-only) ──────────────────────────────────────────────────

/**
 * Safe row from GET /api/ha-llm-usage — never includes prompt bodies or secrets.
 */
export interface HaLlmUsageDTO {
  id: number;
  promptId: string | null;
  promptHash: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cascadeDecision: string;
  cascadeReason: string | null;
  userLogin: string | null;
  createdAt: string;
}

/** Counts-only aggregate from GET /api/ha-llm-usage/summary. */
export interface HaLlmUsageSummaryDTO {
  cascadeDecision: string;
  count: number;
}

export interface HaLlmUsagePage {
  items: HaLlmUsageDTO[];
  totalCount: number;
}

// ── Error ─────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by llmAdminService when any fetch call returns a non-OK
 * HTTP status. Callers can inspect `.status` to branch on 400 vs 403 vs 503.
 */
export class LlmAdminError extends Error {
  constructor(public readonly status: number) {
    super(`LLM admin API error: HTTP ${status}`);
    this.name = 'LlmAdminError';
  }
}
