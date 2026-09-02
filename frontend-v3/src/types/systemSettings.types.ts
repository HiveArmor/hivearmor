/**
 * System Settings — shared TypeScript type definitions.
 *
 * These shapes mirror the backend DTOs under
 * com.hivearmor.service.dto.admin exactly.
 *
 * Invariants:
 *   - LlmProvider is a closed union — no `string` fallback, no `any`.
 *   - apiKey comes back as "***" on GET (masked by the backend).
 *   - password comes back as "***" on GET (masked by the backend).
 *   - LlmProbeResult.ok drives the UI success/error path.
 *
 * Requirements: 1.1, 1.3, 1.4, 13.8
 */

// ── AI/LLM ────────────────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'azure' | 'anthropic' | 'ollama' | 'custom';

/**
 * AI/LLM settings shape returned by GET /api/ha-admin/settings
 * and sent (with apiKeyTouched) on PUT /api/ha-admin/settings/ai.
 */
export interface SystemSettingsAi {
  /** LLM provider — one of the discriminated union values. */
  provider: LlmProvider;
  /** Model identifier (e.g. "gpt-4o", "claude-3-5-sonnet"). */
  model: string;
  /** API base endpoint URL. */
  endpoint: string;
  /**
   * API key value.
   * - On GET: always returns the literal string "***" (backend-masked).
   * - On PUT: the user-supplied value; honour alongside apiKeyTouched.
   */
  apiKey: string;
  /**
   * Set to true only when the user has edited the apiKey field during the
   * current form session (Req 1.6).  When false or absent the backend
   * preserves the currently stored key and ignores apiKey in the request body.
   */
  apiKeyTouched: boolean;
}

// ── General ───────────────────────────────────────────────────────────────────

export interface SystemSettingsGeneral {
  siteName: string;
  timezone: string;
  defaultLocale: string;
}

// ── Email / SMTP ──────────────────────────────────────────────────────────────

export interface SystemSettingsEmail {
  host: string;
  port: number;
  username: string;
  /**
   * SMTP password.
   * - On GET: always returns the literal string "***" (backend-masked).
   */
  password: string;
  from: string;
  useTls: boolean;
}

// ── Security ──────────────────────────────────────────────────────────────────

export interface SystemSettingsSecurity {
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  passwordMinLength: number;
}

// ── Root ──────────────────────────────────────────────────────────────────────

/** Full settings object returned by GET /api/ha-admin/settings. */
export interface SystemSettings {
  general: SystemSettingsGeneral;
  email: SystemSettingsEmail;
  ai: SystemSettingsAi;
  security: SystemSettingsSecurity;
}

// ── LLM Probe result ──────────────────────────────────────────────────────────

/**
 * Response shape from POST /api/ha-admin/settings/ai/test.
 *
 * - ok: true  → { ok: true,  latencyMs: number }
 * - ok: false → { ok: false, error: string }      (sanitized — never includes apiKey)
 */
export interface LlmProbeResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

// ── SMTP test-send result ──────────────────────────────────────────────────────

/**
 * Response shape from POST /api/ha-admin/settings/email/test.
 *
 * The backend always returns HTTP 200 with this body (same contract as the AI
 * probe):
 *   - ok: true  → { ok: true }
 *   - ok: false → { ok: false, error: string }  (sanitized — never includes the
 *                                                 SMTP password or a stack trace)
 */
export interface SmtpTestResult {
  ok: boolean;
  error?: string;
}
