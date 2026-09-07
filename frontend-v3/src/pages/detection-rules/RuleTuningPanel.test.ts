/**
 * Detection Next-items service + component smoke tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  BASELINE_ANOMALY_RULE_ID,
  BASELINE_CONDITION_FIELD_OPTIONS,
  EXCEPTION_OPERATOR_OPTIONS,
  filterBaselineExceptions,
  isBaselineAnomalyRuleId,
  validateExceptionConditions,
  type DetectionException,
} from '@/services/detectionException.service';

describe('detectionException.service', () => {
  it('exports preview, list, save, and activate helpers', async () => {
    const module = await import('@/services/detectionException.service');
    expect(typeof module.previewExceptionImpact).toBe('function');
    expect(typeof module.listExceptions).toBe('function');
    expect(typeof module.saveException).toBe('function');
    expect(typeof module.setExceptionActive).toBe('function');
  });

  it('exposes baseline:anomaly synthetic ruleId and engine field options', () => {
    expect(BASELINE_ANOMALY_RULE_ID).toBe('baseline:anomaly');
    expect(isBaselineAnomalyRuleId(BASELINE_ANOMALY_RULE_ID)).toBe(true);
    expect(isBaselineAnomalyRuleId(42)).toBe(false);
    expect(BASELINE_CONDITION_FIELD_OPTIONS.map((item) => item.value)).toEqual([
      'host.name',
      'user.name',
      'dataSource',
      'action',
    ]);
    expect(EXCEPTION_OPERATOR_OPTIONS.map((item) => item.value)).toContain('is_not');
    expect(EXCEPTION_OPERATOR_OPTIONS.map((item) => item.value)).toContain('contains');
  });

  it('filters baseline-scoped exceptions and validates conditions', () => {
    const rows: DetectionException[] = [
      {
        id: 1,
        ruleId: BASELINE_ANOMALY_RULE_ID,
        title: 'Baseline host',
        reason: null,
        conditions: [{ field: 'host.name', operator: 'is', value: 'a' }],
        active: true,
        status: 'active',
        createdBy: null,
        activatedBy: null,
        activatedAt: null,
        createdAt: null,
        updatedAt: null,
        honesty: 'fixture',
      },
      {
        id: 2,
        ruleId: '99',
        title: 'CEL rule',
        reason: null,
        conditions: [{ field: 'host.name', operator: 'is', value: 'b' }],
        active: false,
        status: 'draft',
        createdBy: null,
        activatedBy: null,
        activatedAt: null,
        createdAt: null,
        updatedAt: null,
        honesty: 'fixture',
      },
    ];
    expect(filterBaselineExceptions(rows)).toHaveLength(1);
    expect(filterBaselineExceptions(rows)[0]?.id).toBe(1);
    expect(validateExceptionConditions([{ field: '', operator: 'is', value: '' }])).toMatch(/condition/i);
    expect(validateExceptionConditions([{ field: 'host.name', operator: 'is', value: 'x' }])).toBeNull();
    expect(
      validateExceptionConditions([{ field: 'host.name', operator: 'equals', value: 'x' }]),
    ).toMatch(/operator/i);
  });
});

describe('detectionPipeline.service', () => {
  it('exports fetchDetectionPipelineHealth', async () => {
    const module = await import('@/services/detectionPipeline.service');
    expect(typeof module.fetchDetectionPipelineHealth).toBe('function');
  });
});

describe('RuleTuningPanel', () => {
  it('exports RuleTuningPanel component', async () => {
    const module = await import('./components/RuleTuningPanel');
    expect(typeof module.RuleTuningPanel).toBe('function');
  });
});

describe('BaselineExceptionPanel', () => {
  it('exports BaselineExceptionPanel and binds synthetic ruleId in source', async () => {
    const module = await import('./components/BaselineExceptionPanel');
    expect(typeof module.BaselineExceptionPanel).toBe('function');
    const source = readFileSync(
      join(process.cwd(), 'src/pages/detection-rules/components/BaselineExceptionPanel.tsx'),
      'utf8',
    );
    expect(source).toContain('BASELINE_ANOMALY_RULE_ID');
    expect(source).toContain('STAGING CANDIDATE');
    expect(source).toContain('sync lag');
    expect(source).toContain('host.name');
    expect(source).toContain('dataSource');
    expect(source).toContain('draftDeniedTitle');
    expect(source).toContain('activateDeniedTitle');
    expect(source).toContain('Activate requires SOC Manager');
  });
});

describe('DetectionPipelineHealthStrip', () => {
  it('exports DetectionPipelineHealthStrip component', async () => {
    const module = await import('./components/DetectionPipelineHealthStrip');
    expect(typeof module.DetectionPipelineHealthStrip).toBe('function');
  });
});

describe('detectionRules.capabilities next flags', () => {
  it('enables persist and observability gates', async () => {
    const module = await import('./detectionRules.capabilities');
    expect(module.DET_EXCEPTION_PERSIST).toBe(true);
    expect(module.DET_OBS_PIPELINE_HEALTH).toBe(true);
  });
});

describe('DET-FP engine enforcement honesty', () => {
  it('RuleTuningPanel copy claims active exceptions are enforced', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/detection-rules/components/RuleTuningPanel.tsx'),
      'utf8',
    );
    expect(source).toContain('enforced by the correlation engine');
    expect(source).toContain('baseline:anomaly');
    expect(source).toContain('graph-offense');
    expect(source).not.toContain('still uncovered');
    expect(source).not.toContain('sequence/graph paths not covered');
    expect(source).not.toContain('not yet end-to-end guaranteed');
  });

  it('Detection Engineering page exposes Baseline exceptions view', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/detection-rules/DetectionRulesPage.tsx'),
      'utf8',
    );
    expect(source).toContain('BaselineExceptionPanel');
    expect(source).toContain('Baseline exceptions');
    expect(source).toContain("'baseline'");
  });

  it('pipeline health service exposes exception counters', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/detectionPipeline.service.ts'),
      'utf8',
    );
    expect(source).toContain('exceptionsSuppressed');
    expect(source).toContain('activeExceptions');
  });
});
