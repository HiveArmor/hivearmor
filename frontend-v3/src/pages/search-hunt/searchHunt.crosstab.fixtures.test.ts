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

  it('a bucketed column axis returns ISO bucket-start keys and sets the bucketed flags', () => {
    const r = getFoundationHuntCrosstab(req({ colField: '@timestamp', colBucket: { interval: '1h' } }));
    expect(r.colBucketed).toBe(true);
    expect(r.colBucketInterval).toBe('1h');
    expect(r.rowBucketed).toBe(false);
    // Column keys are ISO timestamps aligned to the hour (minutes/seconds zeroed).
    expect(r.colKeys.length).toBeGreaterThan(0);
    r.colKeys.forEach((k) => {
      const d = new Date(k);
      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    });
  });

  it('an INCLUDE-missing row axis surfaces the (missing) sentinel key and sets the flags', () => {
    // A field the fixture never populates → every event is field-absent → all land in (missing).
    const r = getFoundationHuntCrosstab(req({ rowField: 'nonexistent.field', rowMissing: 'include' }));
    expect(r.rowHasMissingBucket).toBe(true);
    expect(r.colHasMissingBucket).toBe(false);
    expect(r.missingKey).toBe('\u0000(missing)');
    expect(r.rowKeys).toContain('\u0000(missing)');
  });

  it('flags a multi-valued axis (event.category) and not a single-valued one', () => {
    const r = getFoundationHuntCrosstab(req({ rowField: 'event.category', colField: 'event.action' }));
    expect(r.rowMultiValued).toBe(true);
    expect(r.colMultiValued).toBe(false);
  });

  it('populates previous-period comparison values on cells when comparison is requested', () => {
    const r = getFoundationHuntCrosstab(req({ comparison: { mode: 'previous_period' } }));
    expect(r.comparison?.mode).toBe('previous_period');
    const withCells = r.cells.filter((c) => c.value > 0);
    expect(withCells.length).toBeGreaterThan(0);
    for (const c of withCells) {
      expect(typeof c.comparisonValue).toBe('number');
      expect(c.delta).toBe(c.value - (c.comparisonValue as number));
    }
  });

  it('omits comparison entirely when not requested (response unchanged)', () => {
    const r = getFoundationHuntCrosstab(req({}));
    expect(r.comparison).toBeUndefined();
    expect(r.cells.every((c) => c.comparisonValue === undefined)).toBe(true);
  });

  it('attaches rowDeviations only for a user.name row axis when deviation is requested', () => {
    const onUser = getFoundationHuntCrosstab(req({ rowField: 'user.name', deviation: true }));
    expect(onUser.rowDeviations).toBeDefined();
    expect(onUser.rowDeviations?.length).toBe(onUser.rowKeys.length);
    expect(onUser.rowDeviations?.some((d) => d && typeof d.zScore === 'number')).toBe(true);
    // Not a user axis → no deviation even when requested.
    const onHost = getFoundationHuntCrosstab(req({ rowField: 'host.name', deviation: true }));
    expect(onHost.rowDeviations).toBeUndefined();
  });
});
