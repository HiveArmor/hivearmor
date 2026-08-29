/**
 * DetectionRulesPage Tests (S22)
 * Basic smoke tests per DEF-01 acceptance criteria
 */

import { describe, it, expect } from 'vitest';

import type { DetectionRule } from './detectionRules.types';

describe('DetectionRulesPage', () => {
  it('exports DetectionRulesPage component', async () => {
    const module = await import('./DetectionRulesPage');
    expect(module.DetectionRulesPage).toBeTruthy();
    expect(typeof module.DetectionRulesPage).toBe('function');
  });

  it('DetectionRule type has required fields', () => {
    const rule: DetectionRule = {
      id: 1,
      ruleName: 'Test Rule',
      dataTypes: ['Windows'],
      ruleActive: true,
      lastModified: '2026-07-23T00:00:00Z',
      sigmaRuleId: null,
    };

    expect(rule.id).toBe(1);
    expect(rule.ruleName).toBe('Test Rule');
    expect(rule.dataTypes.length).toBe(1);
    expect(rule.ruleActive).toBe(true);
  });
});

describe('detectionRules.service', () => {
  it('exports fetchRules function', async () => {
    const module = await import('./detectionRules.service');
    expect(module.fetchRules).toBeTruthy();
    expect(typeof module.fetchRules).toBe('function');
  });

  it('exports toggleRuleActive function', async () => {
    const module = await import('./detectionRules.service');
    expect(module.toggleRuleActive).toBeTruthy();
    expect(typeof module.toggleRuleActive).toBe('function');
  });

  it('exports deleteRule function', async () => {
    const module = await import('./detectionRules.service');
    expect(module.deleteRule).toBeTruthy();
    expect(typeof module.deleteRule).toBe('function');
  });

  it('exports syncSigmaRules function', async () => {
    const module = await import('./detectionRules.service');
    expect(module.syncSigmaRules).toBeTruthy();
    expect(typeof module.syncSigmaRules).toBe('function');
  });

  it('exports monitoring and cancellable sandbox functions', async () => {
    const module = await import('./detectionRules.service');
    expect(typeof module.fetchRuleExecutions).toBe('function');
    expect(typeof module.testDetectionSandbox).toBe('function');
    expect(typeof module.validateRuleDraft).toBe('function');
    expect(typeof module.previewRuleDraft).toBe('function');
    expect(typeof module.fetchRuleVersions).toBe('function');
  });
});

describe('columnDefs', () => {
  it('exports createColumnDefs function', async () => {
    const module = await import('./columnDefs');
    expect(module.createColumnDefs).toBeTruthy();
    expect(typeof module.createColumnDefs).toBe('function');
  });

  it('createColumnDefs returns array of column definitions', async () => {
    const module = await import('./columnDefs');
    const toggleLoadingIds = new Set<number>();
    const columnDefs = module.createColumnDefs(
      'ROLE_ANALYST',
      false,
      () => {
        /* no-op */
      },
      () => {
        /* no-op */
      },
      toggleLoadingIds,
      () => {
        /* no-op */
      }
    );

    expect(Array.isArray(columnDefs)).toBe(true);
    expect(columnDefs.length > 0).toBe(true);
    expect(columnDefs.some((col) => col.field === 'ruleName')).toBe(true);
    expect(columnDefs.some((col) => col.field === 'health')).toBe(true);
    expect(columnDefs.some((col) => col.field === 'techniqueId')).toBe(true);
    expect(columnDefs.some((col) => col.field === 'ruleActive')).toBe(true);
  });
});

describe('detection rules capability gates (F10)', () => {
  it('enables DET-009 executions and gap-fill when HaDetectionRuleResource mappings exist', async () => {
    const caps = await import('./detectionRules.capabilities');
    expect(caps.DET_009_EXECUTIONS).toBe(true);
    expect(caps.DET_009_GAP_FILL).toBe(true);
    expect(caps.DET_009_ALERT_PIVOT).toBe(false);
    expect(caps.DET_009_ALERT_PIVOT_DISABLED_TITLE.length).toBeGreaterThan(10);
  });

  it('enables DET-011 validate/preview and keeps DET-014 disabled without a backend mapping', async () => {
    const caps = await import('./detectionRules.capabilities');
    expect(caps.DET_011_VALIDATE_PREVIEW).toBe(true);
    expect(caps.DET_014_AVAILABLE_CONTENT).toBe(false);
    expect(caps.DET_014_DISABLED_TITLE).toContain('DET-014');
  });

  it('exports gap-fill against /api/ha-detection-rules', async () => {
    const module = await import('./detectionRules.service');
    expect(typeof module.triggerDetectionGapFill).toBe('function');
    expect(typeof module.previewRuleDraft).toBe('function');
    expect(typeof module.fetchRuleExecutions).toBe('function');
  });
});

describe('detection rules foundation fixtures', () => {
  it('provide unique, operationally complete fictional records', async () => {
    const { foundationDetectionRules } = await import('./detectionRules.fixtures');
    expect(new Set(foundationDetectionRules.map((rule) => rule.id)).size).toBe(foundationDetectionRules.length);
    expect(foundationDetectionRules.length).toBeGreaterThanOrEqual(40);
    expect(foundationDetectionRules.every((rule) => rule.techniqueId && rule.health && rule.schedule)).toBe(true);
    expect(foundationDetectionRules.every((rule) => rule.ruleDefinition?.includes('celExists(') && rule.ruleDefinition.includes('equals('))).toBe(true);
  });

  it('provide bounded execution and test records only for fixture review', async () => {
    const { foundationDetectionExecutions, foundationDetectionRules, foundationDetectionSampleEvents } = await import('./detectionRules.fixtures');
    const ruleIds = new Set(foundationDetectionRules.map((rule) => rule.id));
    expect(foundationDetectionExecutions.length).toBeLessThanOrEqual(100);
    expect(new Set(foundationDetectionExecutions.map((run) => run.id)).size).toBe(foundationDetectionExecutions.length);
    expect(foundationDetectionExecutions.every((run) => ruleIds.has(run.ruleId))).toBe(true);
    expect(foundationDetectionSampleEvents.every((sample) => Boolean(JSON.parse(sample.json)))).toBe(true);
  });

  it('are excluded by both production build paths', async () => {
    const fs = await import('node:fs');
    const viteConfig = fs.readFileSync(`${process.cwd()}/vite.config.ts`, 'utf8');
    const buildScript = fs.readFileSync(`${process.cwd()}/scripts/build.mjs`, 'utf8');
    expect(viteConfig).toContain('detectionRules.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/detection-rules/detectionRules.fixtures=./src/pages/detection-rules/detectionRules.fixture-disabled.ts');
    const disabledModule = await import('./detectionRules.fixture-disabled');
    expect(disabledModule.foundationDetectionRules).toEqual([]);
    expect(disabledModule.foundationDetectionExecutions).toEqual([]);
    expect(disabledModule.foundationDetectionSampleEvents).toEqual([]);
    expect(disabledModule.foundationDetectionRuleVersions).toEqual([]);
  });
});
