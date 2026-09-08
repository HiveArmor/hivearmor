import { describe, it, expect } from 'vitest';

import { getFoundationHuntCrosstab } from './searchHunt.fixtures';
import type { HuntCrosstabRequest } from './searchHunt.types';

function req(over: Partial<HuntCrosstabRequest> = {}): HuntCrosstabRequest {
  return {
    query: '*', language: 'kql', timeRange: { from: 'now-24h', to: 'now' },
    tenantScope: 'authorized', indexType: 'all',
    rowField: 'host.name', colField: 'event.action', valueFn: 'count',
    rowSize: 20, colSize: 20, ...over,
  };
}

describe('getFoundationHuntCrosstab', () => {
  it('count grand total equals pivot-eligible count, not total matched', () => {
    const r = getFoundationHuntCrosstab(req());
    expect(r.measure.function).toBe('count');
    expect(r.measure.approximate).toBe(false);
    expect(r.grandTotal).toBe(r.pivotEligibleMatched);
    // The info/cloud seed has null host — so eligible < total matched.
    expect(r.pivotEligibleMatched).toBeLessThanOrEqual(r.totalMatched);
    expect(r.totalMatched).toBe(240);
  });

  it('marks totals non-additive and axis selection approximate', () => {
    const r = getFoundationHuntCrosstab(req());
    expect(r.totalSemantics.additive).toBe(false);
    expect(r.axisSelection.approximate).toBe(true);
    expect(r.cardinalityApproximate).toBe(true);
  });

  it('row totals cover the full member, not just visible-cell sums', () => {
    const r = getFoundationHuntCrosstab(req({ rowField: 'host.name', colField: 'event.action' }));
    // For each row, its total >= sum of that row's visible cells (equal when all cols are shown).
    r.rowKeys.forEach((rk, i) => {
      const visible = r.cells.filter((c) => c.row === rk).reduce((s, c) => s + c.value, 0);
      expect(r.rowTotals[i]).toBeGreaterThanOrEqual(visible);
    });
  });

  it('distinct measure is approximate and totals come from set cardinality (not summed cells)', () => {
    const r = getFoundationHuntCrosstab(req({ valueFn: 'distinct', distinctField: 'source.ip' }));
    expect(r.measure.function).toBe('distinct');
    expect(r.measure.approximate).toBe(true);
    // distinct grand of source.ip over eligible cannot exceed the eligible doc count.
    expect(r.grandTotal).toBeGreaterThan(0);
    expect(r.grandTotal).toBeLessThanOrEqual(r.pivotEligibleMatched);
  });

  it('respects an AbortSignal', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => getFoundationHuntCrosstab(req(), controller.signal)).toThrow();
  });
});
