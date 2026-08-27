/**
 * IndexScopePicker — unit tests
 */

import { describe, it, expect } from 'vitest';

import {
  HUNT_INDEX_SCOPE_OPTIONS,
  huntIndexScopeLabel,
  toHuntIndexPattern,
} from './IndexScopePicker';

describe('IndexScopePicker helpers', () => {
  it('exposes four SIEM-style scopes', () => {
    expect(HUNT_INDEX_SCOPE_OPTIONS.map((option) => option.value)).toEqual([
      'all',
      'log',
      'event',
      'alert',
    ]);
  });

  it('maps all → undefined indexPattern for hunt execute', () => {
    expect(toHuntIndexPattern('all')).toBeUndefined();
    expect(toHuntIndexPattern('log')).toBe('log');
    expect(toHuntIndexPattern('event')).toBe('event');
    expect(toHuntIndexPattern('alert')).toBe('alert');
  });

  it('returns short labels for the trigger', () => {
    expect(huntIndexScopeLabel('all')).toBe('All sources');
    expect(huntIndexScopeLabel('alert')).toBe('Alerts');
  });
});
