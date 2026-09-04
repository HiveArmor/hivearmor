/**
 * Hunt AI Contract — MOCK fixtures (v1).
 *
 * Shaped EXACTLY to huntAiContract.types.ts so that flipping huntAiService from
 * 'mock' to 'live' requires zero UI changes once the backend honors the contract.
 * These are design fixtures only — never served in production (guarded in huntAiService).
 */

import type {
  AiProvenance,
  HuntVerdictResponse,
  HuntFieldProvenance,
  HuntClauseExplanation,
} from './huntAiContract.types';

const MOCK_PROVENANCE: AiProvenance = {
  model: 'foundation-sec-8b',
  generatedAt: new Date().toISOString(),
  agentVersion: 'hunt-triage@0.1.0-mock',
  caveat: 'AI-derived — verify before acting',
};

/**
 * A suspicious credential-access verdict over a mocked result set.
 * Reasoning steps carry rowRefs so the UI can scroll+flash the cited grid rows.
 */
export const MOCK_VERDICT: HuntVerdictResponse = {
  schemaVersion: '1',
  state: 'ready',
  verdictId: 'VERDICT-MOCK-0001',
  verdict: 'suspicious',
  confidence: 0.79,
  calibration: {
    agreementRate: 0.84,
    sampleSize: 212,
    window: '90d',
    scope: 'credential-access verdicts',
    overrideTrend: 'flat',
  },
  title: 'Credential-access cluster surfaced from these results',
  summary:
    'A burst of failed authentications against svc_backup from four non-US source IPs, followed by one success — consistent with password spraying that landed.',
  conclusion:
    'The single success from an IP with no prior tenant history, immediately followed by a group-membership change on the same account, indicates a likely credential compromise with privilege consolidation. Recommend disabling the account and reviewing the group change.',
  clusterSize: 37,
  totalConsidered: 1284,
  mitre: [{ tactic: 'Credential Access', technique: 'T1110', subtechnique: 'T1110.003' }],
  reasoning: [
    {
      id: 'r1',
      label: 'Baseline deviation',
      detail: 'svc_backup baseline is single-geo, business-hours; these 36 failures span 3 foreign ASNs.',
      state: 'done',
      rowRefs: ['evt-1', 'evt-2'],
    },
    {
      id: 'r2',
      label: 'Landed authentication',
      detail: 'The lone success at 08:51 came from 185.220.101.44, an IP with no prior tenant history.',
      state: 'done',
      rowRefs: ['evt-3'],
    },
    {
      id: 'r3',
      label: 'Privilege consolidation',
      detail: 'Immediately after, a group-membership change was observed on the same account.',
      state: 'done',
      rowRefs: ['evt-4'],
    },
  ],
  evidence: [
    { id: 'e1', label: 'Targeted account', value: 'svc_backup', rowRef: 'evt-3', kind: 'field', provenanceLensed: false },
    { id: 'e2', label: 'Landing IP', value: '185.220.101.44', rowRef: 'evt-3', kind: 'field', provenanceLensed: false },
    { id: 'e3', label: 'Risk score', value: '91', rowRef: 'evt-3', kind: 'enrichment', provenanceLensed: true },
    { id: 'e4', label: 'Geo', value: 'CN · AS-4837', rowRef: 'evt-3', kind: 'enrichment', provenanceLensed: true },
    { id: 'e5', label: 'Correlation', value: 'group-membership change +19s', rowRef: 'evt-4', kind: 'correlation', provenanceLensed: true },
  ],
  provenance: MOCK_PROVENANCE,
};

/**
 * Field-provenance map for the mocked result set (move 2: "show AI's hand").
 * 'model'/'enrichment' fields get the violet thread; 'raw' fields do not.
 */
export const MOCK_FIELD_PROVENANCE: HuntFieldProvenance[] = [
  { field: '@timestamp', origin: 'raw' },
  { field: 'source.ip', origin: 'raw' },
  { field: 'user', origin: 'raw' },
  { field: 'event.outcome', origin: 'raw' },
  { field: 'severity', origin: 'raw' },
  { field: 'risk.score', origin: 'model', agent: 'hunt-triage' },
  { field: 'source.geo', origin: 'enrichment', agent: 'geo-enrichment' },
];

export function mockExplainClause(clause: string): HuntClauseExplanation {
  return {
    schemaVersion: '1',
    state: 'ready',
    clause,
    explanation: `Filters to events where ${clause} — a bounded KQL clause compiled to a typed OpenSearch term/range query (no free-text query_string reaches the cluster).`,
    provenance: MOCK_PROVENANCE,
  };
}
