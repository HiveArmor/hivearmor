import { describe, it, expect } from 'vitest';

import { suggestPivots, type FieldStat } from './suggestedPivots';
import type { HuntFieldDefinition } from '../searchHunt.types';

const F = (name: string): HuntFieldDefinition => ({
  name, label: name, type: 'keyword', category: 'event', description: '', operators: [':', '!='], coverage: 100,
});

const fields: HuntFieldDefinition[] = [
  F('user.name'), F('host.name'), F('event.action'), F('process.name'), F('event.outcome'),
];

function stats(entries: Record<string, FieldStat>): Map<string, FieldStat> {
  return new Map(Object.entries(entries));
}

describe('suggestPivots', () => {
  it('returns nothing when there are no field stats (no search snapshot yet)', () => {
    expect(suggestPivots(fields, new Map(), 1)).toEqual([]);
  });

  it('ranks a healthy pair and produces an applicable count config', () => {
    const r = suggestPivots(fields, stats({
      'user.name': { coverage: 80, cardinality: 25 },
      'host.name': { coverage: 90, cardinality: 40 },
    }), 7, 3);
    expect(r.length).toBeGreaterThan(0);
    const top = r[0];
    expect([top.config.rowField, top.config.colField].sort()).toEqual(['host.name', 'user.name']);
    expect(top.config.valueFn).toBe('count');
    expect(top.config.tenantId).toBe(7);
    expect(top.rationale).toBeTruthy();
  });

  it('excludes a single-bucket field (cardinality 1) and a sparse field', () => {
    const r = suggestPivots(fields, stats({
      'user.name': { coverage: 80, cardinality: 25 },
      'host.name': { coverage: 90, cardinality: 40 },
      'event.outcome': { coverage: 100, cardinality: 1 },   // single bucket → excluded
      'process.name': { coverage: 3, cardinality: 500 },    // sparse + huge → excluded
    }), null, 5);
    const fieldsUsed = new Set(r.flatMap((s) => [s.config.rowField, s.config.colField]));
    expect(fieldsUsed.has('event.outcome')).toBe(false);
    expect(fieldsUsed.has('process.name')).toBe(false);
  });

  it('gives a template-matching pair a higher rationale/ranking bonus', () => {
    // user.name × host.name is a curated template ("Auth failures by user × host").
    const r = suggestPivots(fields, stats({
      'user.name': { coverage: 70, cardinality: 20 },
      'host.name': { coverage: 70, cardinality: 20 },
      'process.name': { coverage: 70, cardinality: 20 },
    }), null, 3);
    // The template pair should rank first and cite the "common investigative breakdown" rationale.
    const top = r[0];
    const isTemplatePair = [top.config.rowField, top.config.colField].sort().join(',') === 'host.name,user.name';
    expect(isTemplatePair).toBe(true);
    expect(top.rationale).toMatch(/common investigative breakdown/i);
  });
});
