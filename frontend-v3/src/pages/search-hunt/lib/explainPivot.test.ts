import { describe, it, expect } from 'vitest';

import { explainPivot, explainCell } from './explainPivot';
import type { HuntCrosstabResponse } from '../searchHunt.types';

function data(over: Partial<HuntCrosstabResponse> = {}): HuntCrosstabResponse {
  return {
    searchId: 'X', computedAt: 't', totalMatched: 240, pivotEligibleMatched: 200, totalRelation: 'eq',
    measure: { function: 'count', field: null, approximate: false },
    rowKeys: ['a', 'b'], colKeys: ['x', 'y'],
    cells: [{ row: 'a', col: 'x', value: 40 }],
    rowTotals: [40, 0], colTotals: [40, 0], grandTotal: 40,
    totalSemantics: { cell: '', row: '', column: '', grand: '', additive: false },
    rowTruncated: false, colTruncated: false, rowCardinalityEstimate: 2, colCardinalityEstimate: 2,
    cardinalityApproximate: true,
    axisSelection: { strategy: 'distributed_terms', approximate: true, rowShardSize: 200, colShardSize: 200, rowDocCountErrorUpperBound: 0, colDocCountErrorUpperBound: 0 },
    execution: { tookMs: 1, timedOut: false, returnedCells: 1, returnedRows: 2, returnedColumns: 2, truncated: false },
    status: 'COMPLETE', partialFailures: [],
    ...over,
  };
}

describe('explainPivot', () => {
  it('always states the axes, measure, and the non-additive caveat', () => {
    const lines = explainPivot(data(), 'host.name', 'event.action');
    const text = lines.join(' ');
    expect(text).toMatch(/host\.name \(rows\)/);
    expect(text).toMatch(/event\.action \(columns\)/);
    expect(text).toMatch(/count of events/);
    expect(text).toMatch(/not by adding up the cells/i); // non-additive caveat
  });

  it('explains the eligible-vs-matched gap when they differ', () => {
    const lines = explainPivot(data({ totalMatched: 240, pivotEligibleMatched: 200 }), 'host.name', 'event.action');
    expect(lines.join(' ')).toMatch(/200.*of 240|240.*200/);
  });

  it('discloses truncation, missing bucket, multi-valued and comparison when present', () => {
    const lines = explainPivot(data({
      rowTruncated: true, rowCardinalityEstimate: 500,
      rowHasMissingBucket: true, rowMultiValued: true,
      comparison: { mode: 'previous_period', from: 'a', to: 'b' },
    }), 'event.category', 'host.name');
    const text = lines.join(' ');
    expect(text).toMatch(/top 2 of ~500/);
    expect(text).toMatch(/no value.*bucket/i);
    expect(text).toMatch(/several values per event/i);
    expect(text).toMatch(/compared against the previous period/i);
  });

  it('describes a distinct measure correctly', () => {
    const lines = explainPivot(data({ measure: { function: 'distinct', field: 'user.name', approximate: true } }), 'host.name', 'event.action');
    expect(lines.join(' ')).toMatch(/distinct user\.name/);
  });
});

describe('explainCell', () => {
  it('states the cell count and the two filter values', () => {
    const s = explainCell(data(), 'host.name', 'event.action', 'web01', 'login', 40);
    expect(s).toMatch(/40 events/);
    expect(s).toMatch(/host\.name is "web01"/);
    expect(s).toMatch(/event\.action is "login"/);
  });

  it('adds the previous-period delta when the cell carries comparison values', () => {
    const s = explainCell(data(), 'host.name', 'event.action', 'web01', 'login', 120, {
      row: 'web01', col: 'login', value: 120, comparisonValue: 100, delta: 20, deltaPercent: 20,
    });
    expect(s).toMatch(/up \(\+20%\) from 100/);
  });
});
