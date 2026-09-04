/**
 * HiveArmor Hunt AI Contract — v1 (FROZEN 2026-09-04)
 *
 * Authoritative frontend source of truth for the AI-analysis layer over Search & Hunt.
 * Human-readable spec + backend DTO guidance: `.plan/HUNT-AI-CONTRACT-v1.md`.
 *
 * Contract-first strategy: the UI builds against a mock of these shapes; the AI backend
 * builds to fill the SAME shapes; flip mock -> live with one switch (see huntAiService).
 *
 * FREEZE DISCIPLINE: do not edit a field in place after freeze. A change bumps
 * `schemaVersion` to "2" (same rule as immutable Liquibase changesets).
 *
 * Conventions: camelCase, ISO-8601 UTC instant strings, confidence/agreementRate are
 * floats in 0..1 (UI formats to %), IDs are opaque strings.
 */

import type { AiVerdict, AiReasoningStep, AiEvidenceItem } from '../../../components/ai-verdict-card/AiVerdictCard';
import type { HuntTimeRange } from '../searchHunt.types';

/** Every AI response carries one — the graceful-degradation contract (never 500). */
export type AiState = 'ready' | 'computing' | 'unavailable' | 'insufficient_data' | 'disabled';

/** Attached to any model-derived block; drives the ✦ glyph + "verify before acting" caveat. */
export interface AiProvenance {
  model: string;
  generatedAt: string;
  agentVersion: string;
  /** Defaults to "AI-derived — verify before acting". */
  caveat: string;
}

/**
 * Trust-calibration — REDESIGN §6, first-class.
 * RULE: any surfaced `confidence` MUST be accompanied by calibration. A naked
 * confidence score is non-compliant with this contract.
 */
export interface AiCalibration {
  /** Analyst-agreement rate over the window, 0..1. */
  agreementRate: number;
  sampleSize: number;
  /** e.g. "90d". */
  window: string;
  /** e.g. "credential-access verdicts". */
  scope: string;
  overrideTrend: 'up' | 'flat' | 'down';
}

/** MITRE ATT&CK mapping fragment. */
export interface AiMitreRef {
  tactic: string;
  technique: string;
  subtechnique?: string;
}

/* ---------------------------------------------------------------- Verdict (moves 1 + 3) */

export interface HuntVerdictRequest {
  /** The completed search to analyze. */
  searchId: string;
  /** Optional: analyze one auto-surfaced cluster. */
  clusterId?: string;
  /** Optional: analyze an explicit event selection. */
  eventIds?: string[];
}

/** Extends the AiVerdictCard reasoning step with row citations (move 3: reasoning-cites-rows). */
export interface HuntReasoningStep extends AiReasoningStep {
  /** Stable id for keys/feedback. */
  id: string;
  /** HuntEvent ids this step cites — the UI scrolls+flashes these grid rows. */
  rowRefs?: string[];
}

/** Extends the AiVerdictCard evidence item; the Evidence Locker travels into the case (move 8). */
export interface HuntEvidenceItem extends AiEvidenceItem {
  /** Stable id for keys. */
  id: string;
  /** Originating HuntEvent id. */
  rowRef?: string;
  kind: 'field' | 'event' | 'enrichment' | 'correlation';
  /** true = value was model-derived → gets the violet thread (move 2). */
  provenanceLensed: boolean;
}

export interface HuntVerdictResponse {
  schemaVersion: '1';
  state: AiState;
  verdictId: string;
  verdict: AiVerdict;
  /** 0..1 */
  confidence: number;
  /** REQUIRED when state === 'ready'. */
  calibration: AiCalibration;
  title: string;
  summary: string;
  conclusion: string;
  clusterSize: number;
  totalConsidered: number;
  mitre?: AiMitreRef[];
  reasoning: HuntReasoningStep[];
  evidence: HuntEvidenceItem[];
  provenance: AiProvenance;
}

/* ---------------------------------------------------------- Provenance lens (move 2) */

export interface HuntFieldProvenance {
  field: string;
  /** Only 'model' gets the violet thread + ✦; 'enrichment' is a lighter mark; 'raw' none. */
  origin: 'raw' | 'enrichment' | 'model';
  agent?: string;
}

/* ------------------------------------------------------- Leads (move 6, DEFERRED) */

export interface HuntLead {
  id: string;
  title: string;
  rationale: string;
  /** FactsInferenceLayout: verifiable observations. */
  facts: string[];
  /** FactsInferenceLayout: model conclusions. */
  inferences: string[];
  /** 0..1 */
  confidence: number;
  calibration: AiCalibration;
  /** KQL — review-then-run, never auto-executed. */
  suggestedQuery: string;
  suggestedTimeRange?: HuntTimeRange;
  mitre?: AiMitreRef[];
  provenance: AiProvenance;
}

export interface HuntLeadsResponse {
  schemaVersion: '1';
  state: AiState;
  leads: HuntLead[];
}

/* --------------------------------------------------------- Explain + feedback */

export interface HuntClauseExplanation {
  schemaVersion: '1';
  state: AiState;
  clause: string;
  explanation: string;
  provenance: AiProvenance;
}

export interface HuntAiFeedback {
  targetType: 'verdict' | 'lead';
  /** verdictId | lead.id */
  targetId: string;
  vote: 'up' | 'down';
  /** Optional analyst correction — the strongest calibration signal. */
  correctedVerdict?: AiVerdict;
  note?: string;
}

/* ----------------------------------------------------------------- Mock/live switch */

/** Mirrors the existing VITE_USE_FOUNDATION_FIXTURES pattern; UI imports only huntAiService. */
export type HuntAiMode = 'mock' | 'live';
