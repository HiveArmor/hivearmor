import { describe, it, expect } from 'vitest';

import { alertToVerdict, hasVerdictSignals } from './alertVerdict';

import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';

function makeAlert(overrides: Partial<AlertDetailDTO> = {}): AlertDetailDTO {
  return {
    id: 'a1',
    severity: 5,
    timestamp: '2026-09-02T00:00:00Z',
    title: 'Test alert',
    category: 'Authentication',
    status: 'open',
    adversary: null,
    target: null,
    tags: [],
    ruleId: null,
    ruleName: null,
    rawFields: {},
    ...overrides,
  };
}

describe('alertVerdict', () => {
  describe('hasVerdictSignals', () => {
    it('is false with no enrichment signals', () => {
      expect(hasVerdictSignals(makeAlert())).toBe(false);
    });

    it('is true when riskScore is present', () => {
      expect(hasVerdictSignals(makeAlert({ riskScore: 30 }))).toBe(true);
    });

    it('is true when a threat-intel match is present', () => {
      expect(hasVerdictSignals(makeAlert({ threatIntelMatched: true }))).toBe(true);
    });

    it('is true when a MITRE technique is mapped', () => {
      expect(hasVerdictSignals(makeAlert({ mitreTechniqueName: 'Brute Force' }))).toBe(true);
    });
  });

  describe('classify', () => {
    it('malicious when threat-intel matched and high risk', () => {
      const v = alertToVerdict(makeAlert({ riskScore: 85, threatIntelMatched: true }));
      expect(v.verdict).toBe('malicious');
    });

    it('suspicious at high risk without an intel match', () => {
      expect(alertToVerdict(makeAlert({ riskScore: 85 })).verdict).toBe('suspicious');
    });

    it('suspicious in the mid risk band', () => {
      expect(alertToVerdict(makeAlert({ riskScore: 50 })).verdict).toBe('suspicious');
    });

    it('benign at low but non-zero risk', () => {
      expect(alertToVerdict(makeAlert({ riskScore: 10 })).verdict).toBe('benign');
    });

    it('inconclusive when nothing scores (risk 0, severity 0)', () => {
      expect(alertToVerdict(makeAlert({ riskScore: 0, severity: 0 })).verdict).toBe('inconclusive');
    });
  });

  describe('confidence', () => {
    it('prefers the detection confidence over risk score', () => {
      expect(alertToVerdict(makeAlert({ confidence: 77, riskScore: 40 })).confidence).toBe(77);
    });

    it('falls back to risk score when confidence is absent', () => {
      expect(alertToVerdict(makeAlert({ riskScore: 42 })).confidence).toBe(42);
    });

    it('falls back to severity*10 when neither is present', () => {
      expect(alertToVerdict(makeAlert({ severity: 6, mitreTechniqueName: 'X' })).confidence).toBe(60);
    });
  });

  describe('evidence + reasoning', () => {
    it('surfaces MITRE, threat-intel, and adversary IP as evidence when present', () => {
      const v = alertToVerdict(
        makeAlert({
          riskScore: 80,
          killChainPhase: 'Lateral Movement',
          mitreTechniqueId: 'T1021',
          mitreTechniqueName: 'Remote Services',
          threatIntelMatched: true,
          threatIntelSource: 'AlienVault OTX',
          adversary: { ip: '10.0.0.5', hostname: null, processName: null, username: null, networkIds: [] },
        }),
      );
      const labels = v.evidence.map((e) => e.label);
      expect(labels).toContain('Risk score');
      expect(labels).toContain('Kill-chain phase');
      expect(labels).toContain('MITRE technique');
      expect(labels).toContain('Threat-intel source');
      expect(labels).toContain('Adversary IP');
      // Reasoning is always a 4-stage pipeline narration.
      expect(v.reasoning).toHaveLength(4);
      expect(v.reasoning.every((r) => r.state === 'done')).toBe(true);
    });

    it('conclusion is framed as a derived projection, not an autonomous verdict', () => {
      const v = alertToVerdict(makeAlert({ riskScore: 60 }));
      expect(v.conclusion).toMatch(/derived triage projection/i);
    });
  });
});
