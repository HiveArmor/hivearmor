import { describe, expect, it } from 'vitest';

import {
  defaultApprovalConfig,
  defaultConditionConfig,
  hydrateConditionConfig,
  normalizeConditionConfig,
  normalizeOnFalse,
  resolveBuilderNodeType,
  serializeStepConfig,
  toEngineStepType,
} from './playbookBuilder.serialize';

import type { PlaybookStep } from '@/types/playbook';

describe('playbookBuilder.serialize', () => {
  describe('toEngineStepType', () => {
    it('maps approval and condition to engine stepTypes', () => {
      expect(toEngineStepType('approval')).toBe('approval');
      expect(toEngineStepType('condition')).toBe('condition');
      expect(toEngineStepType('delay')).toBe('delay');
      expect(toEngineStepType('loop')).toBe('loop');
      expect(toEngineStepType('action')).toBe('action');
      expect(toEngineStepType('parallel')).toBe('action');
    });
  });

  describe('normalizeConditionConfig', () => {
    it('rewrites legacy operator to op and defaults onFalse', () => {
      expect(normalizeConditionConfig({
        field: 'severity',
        operator: 'gte',
        value: 'high',
      })).toEqual({
        field: 'severity',
        op: 'gte',
        value: 'high',
        onFalse: 'stop_success',
      });
    });

    it('preserves all/any groups with onFalse', () => {
      const result = normalizeConditionConfig({
        all: [
          { field: 'severity', op: 'eq', value: 'critical' },
          { field: 'score', op: 'gte', value: 80 },
        ],
        onFalse: 'fail',
        operator: 'ignored',
      });
      expect(result['op']).toBeUndefined();
      expect(result['operator']).toBeUndefined();
      expect(result['onFalse']).toBe('fail');
      expect(result['all']).toHaveLength(2);
    });

    it('keeps engine-shaped single clause intact', () => {
      expect(normalizeConditionConfig({
        field: 'severity',
        op: 'in',
        value: ['high', 'critical'],
        onFalse: 'continue',
      })).toEqual({
        field: 'severity',
        op: 'in',
        value: ['high', 'critical'],
        onFalse: 'continue',
      });
    });
  });

  describe('normalizeOnFalse', () => {
    it('accepts engine values and aliases', () => {
      expect(normalizeOnFalse('stop_success')).toBe('stop_success');
      expect(normalizeOnFalse('fail')).toBe('fail');
      expect(normalizeOnFalse('failure')).toBe('fail');
      expect(normalizeOnFalse('continue')).toBe('continue');
      expect(normalizeOnFalse('skip')).toBe('continue');
      expect(normalizeOnFalse(undefined)).toBe('stop_success');
      expect(normalizeOnFalse('nope')).toBe('stop_success');
    });
  });

  describe('serializeStepConfig', () => {
    const layout = {
      nodeId: 'cond-1',
      description: 'Severity gate',
      position: { x: 10, y: 20 },
      next: [{ target: 'end', sourceHandle: 'yes', label: 'Yes' }],
    };

    it('serializes condition with op/onFalse and builder metadata', () => {
      const config = serializeStepConfig(
        'condition',
        { field: 'severity', operator: 'eq', value: 'high' },
        layout,
      );
      expect(config['field']).toBe('severity');
      expect(config['op']).toBe('eq');
      expect(config['operator']).toBeUndefined();
      expect(config['value']).toBe('high');
      expect(config['onFalse']).toBe('stop_success');
      expect(config['builderNodeType']).toBe('condition');
      expect(config['builderNodeId']).toBe('cond-1');
      expect(config['builderNext']).toEqual(layout.next);
    });

    it('serializes approval without fake actionId', () => {
      const config = serializeStepConfig(
        'approval',
        {
          authority: 'ROLE_SOC_MANAGER',
          sla: '15m',
          actionId: 'hivearmor.require-approval',
        },
        { ...layout, nodeId: 'apr-1', description: 'SOC approve' },
      );
      expect(config['actionId']).toBeUndefined();
      expect(config['builderNodeType']).toBe('approval');
      expect(config['authority']).toBe('ROLE_SOC_MANAGER');
    });

    it('keeps actionId on action steps', () => {
      const config = serializeStepConfig(
        'action',
        { params: {} },
        { ...layout, nodeId: 'act-1', description: 'Isolate', actionId: 'isolate_host' },
      );
      expect(config['actionId']).toBe('isolate_host');
      expect(config['builderNodeType']).toBe('action');
    });
  });

  describe('resolveBuilderNodeType / hydrateConditionConfig', () => {
    it('hydrates approval from stepType and legacy fake actionId', () => {
      const byType: PlaybookStep = {
        stepIndex: 0,
        stepType: 'approval',
        label: 'Approve',
        config: {},
      };
      expect(resolveBuilderNodeType(byType)).toBe('approval');

      const legacy: PlaybookStep = {
        stepIndex: 0,
        stepType: 'action',
        label: 'Approve',
        config: { actionId: 'hivearmor.require-approval' },
      };
      expect(resolveBuilderNodeType(legacy)).toBe('approval');
    });

    it('prefers builderNodeType when present', () => {
      const step: PlaybookStep = {
        stepIndex: 0,
        stepType: 'action',
        label: 'Decision',
        config: { builderNodeType: 'condition', field: 'severity', op: 'eq', value: 'high' },
      };
      expect(resolveBuilderNodeType(step)).toBe('condition');
    });

    it('hydrates legacy operator into op for the UI', () => {
      expect(hydrateConditionConfig({
        field: 'severity',
        operator: 'neq',
        value: 'low',
      })).toEqual({
        field: 'severity',
        op: 'neq',
        value: 'low',
        onFalse: 'stop_success',
      });
    });
  });

  describe('defaults', () => {
    it('ships engine-compatible condition and approval defaults', () => {
      expect(defaultConditionConfig()).toEqual({
        field: 'severity',
        op: 'eq',
        value: 'high',
        onFalse: 'stop_success',
      });
      expect(defaultApprovalConfig()).toMatchObject({
        authority: 'ROLE_SOC_MANAGER',
        sla: '15m',
      });
    });
  });
});
