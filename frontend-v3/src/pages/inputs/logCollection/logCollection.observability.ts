/**
 * Log-Collection Observability — mapping + honesty constants (SPEC-09 / W8).
 *
 * The operator's mental model is a chain:
 *   Agent → Collector → Source → Collection → Parsing → Ingestion → Detection
 * The UI must let an analyst answer each link. This module encodes ONLY what the
 * real backend endpoints can truthfully answer — verified against source, no
 * invented APIs and no fabricated "green" pipeline.
 *
 * Verified endpoints backing this view (file:line evidence in the W8 PR):
 *   - GET /api/ha-inputs/sources          (HaDataSourceController)          — source inventory, eps, epsHistory[], lastEventAt, grpc/opensearch reachability
 *   - GET /api/agent-manager/agents       (AgentManagerResource)           — fleet liveness (status, lastSeen) — NO source join key
 *   - GET /api/correlation-rule/search-by-filters?dataTypes=<t>            — rules consuming a dataType (derivable count)
 *   - GET /api/ha-pipeline-signals        (HaPipelineSignalsResource)      — cluster-level ingest signals
 *   - GET /api/ha-parsers                 (HaParsersResource)              — parser configuration/status
 *
 * Honesty invariants (do NOT weaken):
 *   - Q1 (agent alive): no client-visible join key exists between a source and a
 *     sensor/agent, so per-source attribution is NOT claimed. Only fleet-level
 *     liveness is shown, explicitly flagged as a backend need.
 *   - Q8 (detections consuming): derivable via dataTypes filter, but the
 *     source.type → rule dataType mapping is PARTIAL. Only types with a proven
 *     match get a count; the rest carry an explicit "not rule-addressable" note
 *     instead of a misleading 0.
 *   - Reachable ≠ healthy: the collector emits only a binary heartbeat, so the
 *     badge copy distinguishes reachability from health and never asserts health.
 */

import type { HaDataSourceType } from '@/types/dataSource.types';

// ── Q8: source.type → rule dataType mapping (verified against /rules) ────────

/**
 * Result of resolving a source type to a rule-addressable detection dataType.
 * - `matched`: the type IS a dataType that rules declare → a rule count is truthful.
 * - `not_addressable`: the type is a transport/collector identifier no rule declares
 *   (agent, kafka) → a count would be a false 0; show a note, not a number.
 */
export type DetectionMappingKind = 'matched' | 'not_addressable';

export interface DetectionMapping {
  kind: DetectionMappingKind;
  /** The dataType string to query rules with (only present when kind === 'matched'). */
  dataType: string | null;
  /** Human note surfaced when a truthful count is not possible. */
  note: string | null;
}

/**
 * Per-type verdict, verified from the actual `dataTypes:` values declared across
 * every rule under /rules (recon 2026-09-14):
 *   syslog(3), wineventlog(51), aws(84), azure(54) declared by rules → MATCH.
 *   gcp: rules use `google`, not `gcp` → remap.
 *   agent, kafka: no rule declares them (transport/collector identifiers) → not addressable.
 * A naive `dataTypes=[source.type]` would under-report gcp and show a false 0 for
 * agent/kafka, so those are handled explicitly here.
 */
const DETECTION_MAPPING: Record<HaDataSourceType, DetectionMapping> = {
  syslog: { kind: 'matched', dataType: 'syslog', note: null },
  wineventlog: { kind: 'matched', dataType: 'wineventlog', note: null },
  aws: { kind: 'matched', dataType: 'aws', note: null },
  azure: { kind: 'matched', dataType: 'azure', note: null },
  // Rules declare GCP telemetry under the dataType `google`, never `gcp`.
  gcp: { kind: 'matched', dataType: 'google', note: null },
  // `agent` is a collector transport; agent telemetry is consumed under
  // process/fim/wineventlog/linux/windows dataTypes, not a dataType named `agent`.
  agent: {
    kind: 'not_addressable',
    dataType: null,
    note: 'Endpoint-agent telemetry is consumed under process, FIM and OS dataTypes — not a single "agent" dataType, so a per-source rule count is not meaningful here.',
  },
  // `kafka` is a transport, not a data type; no rule declares it.
  kafka: {
    kind: 'not_addressable',
    dataType: null,
    note: 'Kafka is a transport, not a detection dataType — the payload dataType depends on the topic contents, so a per-source rule count is not meaningful here.',
  },
};

export function resolveDetectionMapping(type: HaDataSourceType): DetectionMapping {
  return DETECTION_MAPPING[type] ?? { kind: 'not_addressable', dataType: null, note: 'Unrecognised source type; detection mapping unavailable.' };
}

// ── The 10 operator questions (SPEC-09 §Problem board) ───────────────────────

export type QuestionAnswerability = 'answered' | 'partial' | 'backend_needed';

export interface OperatorQuestion {
  id: number;
  /** The chain link this question probes. */
  link: string;
  question: string;
  answerability: QuestionAnswerability;
  /** How this view answers it, or why it cannot. Always honest. */
  basis: string;
}

/**
 * The board reflects what THIS view can establish from the verified endpoints.
 * `answered` = a real signal backs it; `partial` = a coarser signal than the
 * question asks; `backend_needed` = no endpoint/field supplies it (flagged, not faked).
 */
export const OPERATOR_QUESTIONS: OperatorQuestion[] = [
  {
    id: 1,
    link: 'Agent',
    question: 'Is the agent alive?',
    answerability: 'backend_needed',
    basis: 'Fleet liveness is shown from agent-manager (status, last-seen), but no source↔agent join key is exposed by either DTO, so per-source attribution needs a backend linkage field.',
  },
  {
    id: 2,
    link: 'Collection',
    question: 'Is collection enabled?',
    answerability: 'answered',
    basis: 'Source `enabled` flag from GET /api/ha-inputs/sources.',
  },
  {
    id: 3,
    link: 'Collector',
    question: 'Is the collector healthy?',
    answerability: 'partial',
    basis: 'Only adapter reachability is reported (gRPC / OpenSearch reachable-or-not). The collector emits a binary heartbeat — reachable is not the same as healthy.',
  },
  {
    id: 4,
    link: 'Source',
    question: 'Is the source reachable?',
    answerability: 'answered',
    basis: 'gRPC and OpenSearch reachability per source from GET /api/ha-inputs/sources.',
  },
  {
    id: 5,
    link: 'Collection',
    question: 'Are logs being collected?',
    answerability: 'answered',
    basis: 'Live EPS and last-event timestamp per source; EPS history sparkline over the reported window.',
  },
  {
    id: 6,
    link: 'Parsing',
    question: 'Are logs being parsed?',
    answerability: 'answered',
    basis: 'Parser configuration and matched counts from GET /api/ha-parsers.',
  },
  {
    id: 7,
    link: 'Ingestion',
    question: 'Are logs reaching HiveArmor?',
    answerability: 'partial',
    basis: 'Cluster-level ingest and store signals from GET /api/ha-pipeline-signals; per-source end-to-end delivery attribution is not exposed.',
  },
  {
    id: 8,
    link: 'Detection',
    question: 'Are detections consuming this source?',
    answerability: 'partial',
    basis: 'Derived by counting rules whose dataType matches the source type via search-by-filters. Only meaningful where the source type maps to a rule dataType (agent and kafka do not).',
  },
  {
    id: 9,
    link: 'Collection',
    question: 'When was the last successful collection?',
    answerability: 'answered',
    basis: 'Last-event timestamp per source from GET /api/ha-inputs/sources.',
  },
  {
    id: 10,
    link: 'Source',
    question: 'Why did collection fail?',
    answerability: 'partial',
    basis: 'Reachability loss is visible; parse rejects are on Failures. A source-side outage cause (e.g. upstream silence) is not transmitted by the collector — only reachability is.',
  },
];

// ── Bundle-visible honesty strings (asserted by the honesty guard test) ──────

export const AGENT_LIVENESS_BACKEND_NOTE =
  'Agent liveness is fleet-level: agent-manager reports each agent’s status and last-seen, but neither the source nor the agent record exposes a join key, so an agent cannot be attributed to a specific source here. Per-source agent liveness needs a backend linkage field.';

export const REACHABLE_NOT_HEALTHY_NOTE =
  'Reachable is not the same as healthy. The collector emits only a binary heartbeat, so this view reports adapter reachability — it does not assert collector health, and a reachable collector whose upstream source has gone silent still reads reachable.';

export const DETECTION_CONSUMPTION_NOTE =
  'Detection consumption is derived by matching a source’s type to the dataTypes declared by correlation rules. It is a rule-coverage indicator, not a runtime processing receipt — a matched rule may still be inactive.';
