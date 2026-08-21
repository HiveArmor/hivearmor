/**
 * ruleGeneration.types.ts — Rule Generation API TypeScript types (Sprint 28).
 *
 * These shapes mirror the backend DTOs under
 * com.hivearmor.web.rest.rulegen.HaRuleGenerationResource exactly.
 *
 * Invariants:
 *   - Zero `any` types — all shapes are fully typed.
 *   - SessionStatus is a closed union literal matching the JPA enum values.
 *   - Nullable string fields use `string | null` (not `undefined`), matching
 *     the JSON wire format where the backend serialises null explicitly.
 *
 * Requirements: 6.5
 */

// ── Session status ────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a rule generation session.
 * Values match `HaRuleGenSession.Status` enum in the backend verbatim.
 */
export type SessionStatus = 'pending_review' | 'approved' | 'rejected';

// ── Signal summary ────────────────────────────────────────────────────────────

/**
 * A single signal group row returned by GET /api/ha-rules/signals.
 *
 * - firstSeen / lastSeen are ISO-8601 instant strings as serialised by Jackson.
 */
export interface SignalGroupDTO {
  dataType: string;
  signalType: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Aggregated signal summary returned by GET /api/ha-rules/signals.
 */
export interface SignalSummaryDTO {
  minCount: number;
  truePositiveTotal: number;
  falsePositiveTotal: number;
  groups: SignalGroupDTO[];
}

// ── Rule generation session ───────────────────────────────────────────────────

/**
 * Response payload for rule generation session endpoints.
 * Mirrors `RuleGenSessionDTO` Java record in the backend.
 *
 * - requestedBy and approvedPath are null when unavailable.
 * - createdAt / updatedAt are ISO-8601 instant strings.
 */
export interface RuleGenSessionDTO {
  id: number;
  status: SessionStatus;
  ruleName: string;
  ruleYaml: string;
  signalKey: string;
  requestedBy: string | null;
  approvedPath: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

/**
 * Request body for POST /api/ha-rules/sessions (generate a new rule suggestion).
 */
export interface GenerateRequestDTO {
  signalKey: string;
  minCount: number;
}

// ── Error ─────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by ruleGenerationService when any fetch call returns a
 * non-OK HTTP status. Callers can inspect `.status` to branch on 400 vs 403
 * vs 500.
 */
export class RuleGenerationError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `rule-generation HTTP ${status}`);
    this.name = 'RuleGenerationError';
  }
}
