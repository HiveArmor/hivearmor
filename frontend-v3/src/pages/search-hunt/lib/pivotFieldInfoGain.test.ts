import { describe, it, expect } from 'vitest';

import { rankInformativeFields } from './pivotFieldInfoGain';
import type { FieldStat } from './suggestedPivots';
import type { HuntFieldDefinition } from '../searchHunt.types';

const fields = [
  { name: 'host.name', type: 'keyword', category: 'host' },
  { name: 'user.name', type: 'keyword', category: 'user' },
  { name: 'event.action', type: 'keyword', category: 'event' },
  { name: 'trace.id', type: 'keyword', category: 'event' },
] as unknown as HuntFieldDefinition[];

describe('rankInformativeFields', () => {
  it('returns nothing when there are no field stats (no completed search)', () => {
    expect(rankInformativeFields(fields, new Map())).toEqual([]);
  });

  it('ranks a well-split, well-covered field above a near-unique one and a single-bucket one', () => {
    const stats = new Map<string, FieldStat>([
      ['host.name', { coverage: 100, cardinality: 12 }],   // ideal split
      ['user.name', { coverage: 90, cardinality: 3 }],     // decent
      ['trace.id', { coverage: 100, cardinality: 50000 }], // near-unique → over-splits
      ['event.action', { coverage: 100, cardinality: 1 }], // single bucket → excluded
    ]);
    const ranked = rankInformativeFields(fields, stats, 5);
    const names = ranked.map((r) => r.field);
    expect(names[0]).toBe('host.name');               // best fit ranks first
    expect(names).not.toContain('event.action');      // cardinality 1 → excluded (no split)
    // The near-unique field, if present, must rank below the ideal one.
    if (names.includes('trace.id')) {
      expect(names.indexOf('trace.id')).toBeGreaterThan(names.indexOf('host.name'));
    }
    // Gain is a normalized 0..1 score and the rationale is present + explainable.
    expect(ranked[0].gain).toBeGreaterThan(0);
    expect(ranked[0].gain).toBeLessThanOrEqual(1);
    expect(ranked[0].rationale).toMatch(/Splits your results/);
  });
});
