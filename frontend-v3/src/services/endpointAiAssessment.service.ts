/**
 * endpointAiAssessment.service — per-endpoint AI assessment for the agent-detail
 * page's Security tab (SPEC-08, W7).
 *
 * HONESTY CONTRACT (the spec's hard guardrail):
 *   There is NO per-endpoint AI verdict/triage pipeline in the backend. The
 *   soc-ai triage pipeline (/api/soc-ai/result/{alertId}) is ALERT-scoped, and
 *   the agentic supervisor / reasoning-stream / autonomy store are planned, not
 *   built (see .plan/AI-SOC-MASTER-PLAN.md — out of scope for W7).
 *
 *   The ONE real, verified AI endpoint we can honestly drive from here is the
 *   assistive Q&A endpoint:
 *       POST /api/ha-soc-ai/query  → { answer, confidence, sources[], durationMs, finding }
 *   It returns a graceful HTTP-200 FALLBACK (confidence 0, empty sources, an
 *   explanatory "not configured / unavailable" answer) when SOC_AI_BASE_URL is
 *   unset. We surface that as an explicit "AI not active" state — NEVER as a
 *   fabricated verdict. No demo data. No invented reasoning stream.
 *
 * So this service produces an *assistive assessment* of a specific endpoint by
 * asking the real Q&A model to characterise the host, and it classifies the
 * response into one of three honest outcomes:
 *   - `unavailable` — AI not configured / errored (the graceful fallback).
 *   - `inconclusive` — AI answered but with no confident signal.
 *   - `answered` — AI returned a substantive, grounded answer.
 *
 * The Security tab renders `answered` inside an AiVerdictCard wrapped in an
 * AiProvenanceFrame, and the other two states as an honest note — never a
 * green-light verdict the model did not produce.
 *
 * All requests route through the shared apiClient (JWT + X-Tenant-ID). No
 * absolute backend URLs, no invented fields.
 */

import { ApiError } from '@/lib/apiClient';
import {
  isSocAiUnavailableAnswer,
  socAiService,
  type SocAiQueryResponse,
} from '@/services/socAi.service';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/** Outcome class for a per-endpoint AI assessment — honest, never fabricated. */
export type EndpointAiOutcome = 'answered' | 'inconclusive' | 'unavailable';

/** A grounded reasoning step derived from the model's own answer (not synthetic). */
export interface EndpointAiStep {
  label: string;
  detail?: string;
}

/**
 * Normalised assessment the Security tab consumes.
 *
 * `verdict` is intentionally constrained to the assistive vocabulary: the
 * assistive Q&A model does not emit a formal malicious/benign classification, so
 * we never claim one. `outcome` carries the honesty state.
 */
export interface EndpointAiAssessment {
  outcome: EndpointAiOutcome;
  /** The model's answer text (or the honest unavailable/inconclusive message). */
  answer: string;
  /** 0–100 confidence as reported by the backend (0 for unavailable). */
  confidence: number;
  /** Grounded citations the backend extracted (log lines / sources). Never faked. */
  sources: string[];
  /** Model round-trip time in ms (0 when unavailable). */
  durationMs: number;
  /**
   * Reasoning steps derived from the model's OWN answer structure. This is not a
   * live stream (no stream source exists) — it is a static breakdown, so the
   * Security tab keeps AiVerdictCard's static timeline rather than faking a
   * ReasoningStream (per SPEC-08 item 4).
   */
  steps: EndpointAiStep[];
}

/**
 * Build the endpoint-scoped prompt. Kept factual and non-leading: we ask the
 * model to assess the named host from available signals, not to confirm a
 * predetermined verdict.
 */
function buildEndpointPrompt(hostname: string): string {
  return (
    `Assess endpoint "${hostname}" for security concerns based on available ` +
    `telemetry and detection signals. Summarise its current security posture in ` +
    `2–3 sentences, note any suspicious activity, and list recommended SOC ` +
    `actions. If there is insufficient signal to assess, say so plainly.`
  );
}

/**
 * Derive honest reasoning steps from the model answer. We do NOT invent stages —
 * we surface the concrete grounding the backend gave us (how many sources it
 * cited, whether it was confident) so the analyst can see the assessment's basis.
 */
function deriveSteps(response: SocAiQueryResponse): EndpointAiStep[] {
  const steps: EndpointAiStep[] = [
    {
      label: 'Signal review',
      detail:
        response.sources.length > 0
          ? `${response.sources.length} grounded source${response.sources.length === 1 ? '' : 's'} cited`
          : 'No grounded sources cited',
    },
    {
      label: 'Assessment',
      detail:
        response.durationMs > 0
          ? `Model responded in ${response.durationMs} ms`
          : 'Model response',
    },
  ];
  return steps;
}

function toAssessment(response: SocAiQueryResponse): EndpointAiAssessment {
  if (isSocAiUnavailableAnswer(response)) {
    return {
      outcome: 'unavailable',
      answer: response.answer,
      confidence: 0,
      sources: [],
      durationMs: 0,
      steps: [],
    };
  }

  const trimmed = response.answer.trim();
  const inconclusive =
    response.confidence <= 0 || trimmed.length === 0 || response.sources.length === 0;

  return {
    outcome: inconclusive ? 'inconclusive' : 'answered',
    answer: trimmed,
    confidence: Math.max(0, response.confidence),
    sources: response.sources,
    durationMs: response.durationMs,
    steps: deriveSteps(response),
  };
}

/**
 * Fetch an assistive AI assessment for one endpoint.
 *
 * Errors are mapped to an honest `unavailable` outcome rather than thrown, so
 * the Security tab shows "AI not active" instead of an error boundary — the AI
 * being unconfigured is an expected, non-failing state.
 */
export async function fetchEndpointAiAssessment(
  hostname: string,
  signal?: AbortSignal,
): Promise<EndpointAiAssessment> {
  if (fixtureMode) {
    const { getFixtureEndpointAiAssessment } = await import('./endpointAiAssessment.fixtures');
    return getFixtureEndpointAiAssessment(hostname);
  }

  try {
    const response = await socAiService.query(
      {
        prompt: buildEndpointPrompt(hostname),
        context: `Endpoint security review for host ${hostname}.`,
        persist: false,
      },
      signal,
    );
    return toAssessment(response);
  } catch (err) {
    // 401/403 must propagate so the app's auth handling (auto-logout on 401,
    // access-denied note on 403) still applies; treat those as real errors.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    const message =
      err instanceof Error && err.message
        ? `AI assessment unavailable: ${err.message}`
        : 'AI assessment is not available right now.';
    return {
      outcome: 'unavailable',
      answer: message,
      confidence: 0,
      sources: [],
      durationMs: 0,
      steps: [],
    };
  }
}
