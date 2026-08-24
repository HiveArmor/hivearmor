/**
 * Pure graph ↔ PlaybookStep DTO helpers for Playbook Builder.
 *
 * Engine contract (#31 PlaybookConditionEvaluator + approval pause):
 * - condition config: { field, op, value, onFalse } or { all|any: [...] }
 * - approval: stepType "approval" (not a fake actionId-only action step)
 *
 * STAGING CANDIDATE
 */

import type { PlaybookNodeType } from './playbookNodes.types';

import type { PlaybookStep, PlaybookStepType } from '@/types/playbook';

export type ConditionOnFalse = 'stop_success' | 'fail' | 'continue';

const ON_FALSE_VALUES: ReadonlySet<string> = new Set(['stop_success', 'fail', 'continue']);

/** Maps a canvas node type to the engine-facing PlaybookStepDTO.stepType. */
export function toEngineStepType(nodeType: PlaybookNodeType): PlaybookStepType {
  switch (nodeType) {
    case 'condition':
      return 'condition';
    case 'delay':
      return 'delay';
    case 'loop':
      return 'loop';
    case 'approval':
      return 'approval';
    default:
      // action, parallel, subplaybook, transform, intelligence → action until engine grows
      return 'action';
  }
}

export function normalizeOnFalse(raw: unknown): ConditionOnFalse {
  if (typeof raw !== 'string') return 'stop_success';
  const normalized = raw.trim().toLowerCase();
  if (ON_FALSE_VALUES.has(normalized)) return normalized as ConditionOnFalse;
  if (normalized === 'failure' || normalized === 'error') return 'fail';
  if (normalized === 'skip') return 'continue';
  return 'stop_success';
}

/**
 * Normalize condition config so the engine sees `op` (not legacy `operator`)
 * and a valid `onFalse`. Preserves `all` / `any` group shapes.
 */
export function normalizeConditionConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...config };
  const legacyOp = next['operator'];
  delete next['operator'];

  if (Array.isArray(next['all']) || Array.isArray(next['any'])) {
    next['onFalse'] = normalizeOnFalse(next['onFalse']);
    return next;
  }

  const opRaw = next['op'] ?? legacyOp;
  next['op'] = typeof opRaw === 'string' && opRaw.trim() ? opRaw.trim().toLowerCase() : 'eq';
  next['onFalse'] = normalizeOnFalse(next['onFalse']);
  return next;
}

const LEGACY_APPROVAL_ACTION_ID = 'hivearmor.require-approval';

/**
 * Build the persisted step.config for a workflow node.
 * Strips the legacy fake approval actionId; keeps builder* layout metadata.
 */
export function serializeStepConfig(
  nodeType: PlaybookNodeType,
  config: Record<string, unknown>,
  options: {
    actionId?: string;
    nodeId: string;
    description: string;
    position: { x: number; y: number };
    next: Array<{ target: string; sourceHandle?: string; label?: string }>;
  },
): Record<string, unknown> {
  let body: Record<string, unknown> =
    nodeType === 'condition' ? normalizeConditionConfig(config) : { ...config };

  if (nodeType === 'approval') {
    delete body['actionId'];
  } else if (options.actionId) {
    body = { ...body, actionId: options.actionId };
  }

  return {
    ...body,
    builderNodeType: nodeType,
    builderNodeId: options.nodeId,
    builderDescription: options.description,
    builderPosition: options.position,
    builderNext: options.next,
  };
}

/** Resolve canvas node type when hydrating a saved playbook. */
export function resolveBuilderNodeType(step: PlaybookStep): PlaybookNodeType {
  const config = step.config ?? {};
  const stored = config['builderNodeType'];
  if (typeof stored === 'string' && stored.length > 0) {
    return stored as PlaybookNodeType;
  }
  if (step.stepType === 'approval') return 'approval';
  if (config['actionId'] === LEGACY_APPROVAL_ACTION_ID) return 'approval';
  if (step.stepType === 'condition') return 'condition';
  if (step.stepType === 'delay') return 'delay';
  if (step.stepType === 'loop') return 'loop';
  return 'action';
}

/** Hydrate UI condition fields from engine or legacy shapes. */
export function hydrateConditionConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  if (typeof next['op'] !== 'string' && typeof next['operator'] === 'string') {
    next['op'] = next['operator'];
  }
  delete next['operator'];
  if (next['onFalse'] == null) {
    next['onFalse'] = 'stop_success';
  } else {
    next['onFalse'] = normalizeOnFalse(next['onFalse']);
  }
  return next;
}

export function defaultConditionConfig(): Record<string, unknown> {
  return {
    field: 'severity',
    op: 'eq',
    value: 'high',
    onFalse: 'stop_success',
  };
}

export function defaultApprovalConfig(): Record<string, unknown> {
  return {
    authority: 'ROLE_SOC_MANAGER',
    sla: '15m',
    onExpiry: 'stop',
  };
}
