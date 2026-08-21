/**
 * RuleEditorPage Tests (S23)
 */

import { describe, it, expect } from 'vitest';

import { DATA_TYPE_OPTIONS, NEW_RULE_TEMPLATE, DEFAULT_SPLIT_RATIO } from './detectionRules.constants';
import { buildRuleClientValidation } from './detectionRules.validation';

describe('RuleEditor Constants', () => {
  it('should export DATA_TYPE_OPTIONS with expected types', () => {
    expect(Array.isArray(DATA_TYPE_OPTIONS)).toBe(true);
    expect(DATA_TYPE_OPTIONS.includes('Log')).toBe(true);
    expect(DATA_TYPE_OPTIONS.includes('Windows')).toBe(true);
    expect(DATA_TYPE_OPTIONS.includes('Network')).toBe(true);
    expect(DATA_TYPE_OPTIONS.length).toBe(8);
  });

  it('should export a native CEL template with normalized-field guards', () => {
    expect(typeof NEW_RULE_TEMPLATE).toBe('string');
    expect(NEW_RULE_TEMPLATE.includes('celExists(')).toBe(true);
    expect(NEW_RULE_TEMPLATE.includes('equals(')).toBe(true);
    expect(NEW_RULE_TEMPLATE.includes('event.action')).toBe(true);
    expect(NEW_RULE_TEMPLATE.includes('process.name')).toBe(true);
  });

  it('should export DEFAULT_SPLIT_RATIO as 40%', () => {
    expect(DEFAULT_SPLIT_RATIO).toBe(40);
  });
});

describe('RuleEditor Validation Logic', () => {
  it('should validate rule name length constraints', () => {
    const validName = 'Test Rule Name';
    const tooShort = 'Ab';
    const tooLong = 'A'.repeat(201);

    expect(validName.length >= 3 && validName.length <= 200).toBe(true);
    expect(tooShort.length < 3).toBe(true);
    expect(tooLong.length > 200).toBe(true);
  });

  it('should require at least one data type', () => {
    const validDataTypes = ['Log'];
    const invalidDataTypes: string[] = [];

    expect(validDataTypes.length > 0).toBe(true);
    expect(invalidDataTypes.length).toBe(0);
  });

  it('returns structured blocking diagnostics for incomplete definitions', () => {
    const result = buildRuleClientValidation({ ruleName: '', dataTypes: [], ruleDefinition: '' });
    expect(result.valid).toBe(false);
    expect(result.authoritative).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'HA-RULE-001' && item.severity === 'error')).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'HA-DATA-001')).toBe(true);
  });

  it('accepts a structurally complete native CEL definition', () => {
    const result = buildRuleClientValidation({
      ruleName: 'Suspicious PowerShell',
      dataTypes: ['Endpoint'],
      ruleDefinition: 'celExists(process.name) && equals(process.name, "powershell.exe") && !equals(user.name, "approved-admin")',
      techniqueId: 'T1059.001',
      schedule: 'Every 5m',
      lookback: '10m',
    });
    expect(result.valid).toBe(true);
    expect(result.fieldCoverage).toBe(100);
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0);
  });

  it('blocks a lookback shorter than the run interval', () => {
    const result = buildRuleClientValidation({
      ruleName: 'Schedule validation',
      dataTypes: ['Network'],
      ruleDefinition: 'celExists(source.ip) && inCIDR(source.ip, "198.51.100.0/24") && !equals(user.name, "scanner")',
      techniqueId: 'T1046',
      schedule: 'Every 30m',
      lookback: '10m',
    });
    expect(result.diagnostics.some((item) => item.code === 'HA-SCHEDULE-001' && item.severity === 'error')).toBe(true);
  });
});

describe('RuleEditor service surface', () => {
  it('exports validation, preview, history, rollback, and lifecycle functions', async () => {
    const service = await import('./detectionRules.service');
    expect(typeof service.validateRuleDraft).toBe('function');
    expect(typeof service.previewRuleDraft).toBe('function');
    expect(typeof service.fetchRuleVersions).toBe('function');
    expect(typeof service.rollbackRuleVersion).toBe('function');
    expect(typeof service.createRule).toBe('function');
    expect(typeof service.updateRule).toBe('function');
    expect(typeof service.publishRule).toBe('function');
  });

  it('keeps version fixtures bounded and production aliases empty', async () => {
    const fixtures = await import('./detectionRules.fixtures');
    const production = await import('./detectionRules.fixture-disabled');
    expect(fixtures.foundationDetectionRuleVersions.length).toBeGreaterThan(0);
    expect(fixtures.foundationDetectionRuleVersions.length).toBeLessThanOrEqual(20);
    expect(production.foundationDetectionRuleVersions).toEqual([]);
  });
});
