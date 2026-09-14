import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AGENT_LIVENESS_BACKEND_NOTE,
  DETECTION_CONSUMPTION_NOTE,
  OPERATOR_QUESTIONS,
  REACHABLE_NOT_HEALTHY_NOTE,
  resolveDetectionMapping,
} from './logCollection.observability';

/**
 * W8 (SPEC-09) log-collection observability honesty guard.
 *
 * These assertions are the honesty contract: the view must not fabricate a
 * per-source agent join, must not show a misleading detection count for source
 * types no rule declares, and must keep the "reachable ≠ healthy" and
 * "backend-needed" notes bundle-visible.
 */
describe('Log-collection observability honesty (W8 / SPEC-09)', () => {
  describe('detection mapping truthfulness (Q8)', () => {
    it('counts detections only for source types that rules actually declare as dataTypes', () => {
      // Verified against every dataTypes: block under /rules (recon 2026-09-14).
      expect(resolveDetectionMapping('syslog')).toMatchObject({ kind: 'matched', dataType: 'syslog' });
      expect(resolveDetectionMapping('wineventlog')).toMatchObject({ kind: 'matched', dataType: 'wineventlog' });
      expect(resolveDetectionMapping('aws')).toMatchObject({ kind: 'matched', dataType: 'aws' });
      expect(resolveDetectionMapping('azure')).toMatchObject({ kind: 'matched', dataType: 'azure' });
    });

    it('remaps gcp to the real rule dataType `google` (never queries a false `gcp`)', () => {
      const gcp = resolveDetectionMapping('gcp');
      expect(gcp.kind).toBe('matched');
      expect(gcp.dataType).toBe('google');
      expect(gcp.dataType).not.toBe('gcp');
    });

    it('never shows a rule count for transport/collector types no rule declares (agent, kafka)', () => {
      for (const type of ['agent', 'kafka'] as const) {
        const m = resolveDetectionMapping(type);
        expect(m.kind).toBe('not_addressable');
        expect(m.dataType).toBeNull();
        expect(m.note).toBeTruthy();
      }
    });
  });

  describe('operator answerability board', () => {
    it('covers all 10 operator questions', () => {
      expect(OPERATOR_QUESTIONS).toHaveLength(10);
      expect(OPERATOR_QUESTIONS.map((q) => q.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('flags Q1 (agent alive) as backend-needed, never faking a per-source agent join', () => {
      const q1 = OPERATOR_QUESTIONS.find((q) => q.id === 1);
      expect(q1?.answerability).toBe('backend_needed');
      expect(q1?.basis).toMatch(/join key|linkage/i);
    });

    it('does not overclaim: Q3, Q7, Q8, Q10 remain partial', () => {
      for (const id of [3, 7, 8, 10]) {
        expect(OPERATOR_QUESTIONS.find((q) => q.id === id)?.answerability).toBe('partial');
      }
    });
  });

  describe('bundle-visible honesty notes', () => {
    it('keeps reachable≠healthy, agent-liveness-backend, and detection-consumption notes honest', () => {
      expect(REACHABLE_NOT_HEALTHY_NOTE).toMatch(/reachable is not the same as healthy/i);
      expect(AGENT_LIVENESS_BACKEND_NOTE).toMatch(/no.*join key|backend linkage/i);
      expect(DETECTION_CONSUMPTION_NOTE).toMatch(/not a runtime processing receipt/i);
    });

    it('the view renders all three honesty notes and gates fixtures to DEV', () => {
      const view = readFileSync(
        join(process.cwd(), 'src/pages/inputs/logCollection/LogCollectionObservabilityView.tsx'),
        'utf8',
      );
      expect(view).toContain('REACHABLE_NOT_HEALTHY_NOTE');
      expect(view).toContain('AGENT_LIVENESS_BACKEND_NOTE');
      expect(view).toContain('DETECTION_CONSUMPTION_NOTE');

      const service = readFileSync(
        join(process.cwd(), 'src/pages/inputs/logCollection/logCollectionObservability.service.ts'),
        'utf8',
      );
      expect(service).toContain("VITE_USE_FOUNDATION_FIXTURES");
      // Real endpoints only — no invented APIs.
      expect(service).toContain('dataSourcesService');
      expect(service).toContain('fetchSensors');
      expect(service).toContain('countRulesByFilters');
    });
  });

  describe('AddDataSourceWizard retirement (ING-002 pending)', () => {
    it('leaves no orphaned wizard entry point', () => {
      const page = readFileSync(
        join(process.cwd(), 'src/pages/inputs/DataSourceStatusPage.tsx'),
        'utf8',
      );
      expect(page).not.toContain('AddDataSourceWizard');
      // Onboarding stays inside the governed fail-closed PipelineOperationsPage tab.
      expect(page).toContain('PipelineOperationsPage');
    });
  });
});
