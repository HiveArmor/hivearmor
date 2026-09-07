import { describe, expect, it } from 'vitest';

import { inferDetectionEngine } from './detectionRules.service';

const SEQUENCE_YAML = `id: 9101
name: SEQ-BRUTE-FORCE-THEN-SUCCESS
sequence:
  - where: 'action == "failed_auth"'
    within: 15m
  - where: 'action == "authentication_success"'
    within: 30m
`;

const RISK_YAML = `id: 9103
name: RISK-FAILED-AUTH-ACCUMULATION
riskScore: 25
where: 'safe("log.action", "") == "failed_auth"'
`;

const GRAPH_YAML = `id: 9105
name: GRAPH-PRIVILEGED-PIVOT-THEN-C2
type: graph_offense
cypherQuery: |
  MATCH (u:User) RETURN u
`;

describe('DET-TEST-002 engine inference', () => {
  it('classifies sequence, risk, and graph without treating them as CEL', () => {
    expect(inferDetectionEngine(SEQUENCE_YAML)).toBe('sequence');
    expect(inferDetectionEngine(RISK_YAML)).toBe('risk');
    expect(inferDetectionEngine(GRAPH_YAML)).toBe('graph');
    expect(inferDetectionEngine('equals("event.action", "powershell")')).toBe('cel');
  });

  it('honors an explicit engine even when YAML is incomplete', () => {
    expect(inferDetectionEngine('where: true', 'sequence')).toBe('sequence');
  });
});
