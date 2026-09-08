import { describe, it, expect } from 'vitest';

import { buildDetectionContext } from './pivotDetectionContext';
import type { HuntCrosstabResponse, HuntPivotConfig } from '../searchHunt.types';

const config: HuntPivotConfig = {
  v: 1, tenantId: 7, rowField: 'user.name', colField: 'host.name',
  valueFn: 'count', distinctField: null,
  rowBucketInterval: null, colBucketInterval: null, rowMissing: 'omit', colMissing: 'omit',
};

function data(): HuntCrosstabResponse {
  return {
    searchId: 'HUNT-1', computedAt: '2026-09-08T00:00:00Z', totalMatched: 10, pivotEligibleMatched: 8, totalRelation: 'eq',
    measure: { function: 'count', field: null, approximate: false },
    rowKeys: ['alice'], colKeys: ['RU'],
    cells: [{ row: 'alice', col: 'RU', value: 40, significance: { residual: 3.2, expected: 8, ratio: 5, direction: 'over' } }],
    rowTotals: [40], colTotals: [40], grandTotal: 200,
    totalSemantics: { cell: '', row: '', column: '', grand: '', additive: false },
    rowTruncated: false, colTruncated: false, rowCardinalityEstimate: 1, colCardinalityEstimate: 1,
    cardinalityApproximate: true,
    axisSelection: { strategy: 'distributed_terms', approximate: true, rowShardSize: 200, colShardSize: 200, rowDocCountErrorUpperBound: 0, colDocCountErrorUpperBound: 0 },
    execution: { tookMs: 1, timedOut: false, returnedCells: 1, returnedRows: 1, returnedColumns: 1, truncated: false },
    status: 'COMPLETE', partialFailures: [],
  };
}

describe('buildDetectionContext', () => {
  it('assembles the full §30 reproduction bundle from pivot state + response', () => {
    const ctx = buildDetectionContext(data(), config, 'event.category:authentication', ['(user.name:"alice")'], 'alice', 'RU', 40);
    expect(ctx).not.toBeNull();
    expect(ctx?.searchId).toBe('HUNT-1');
    expect(ctx?.query).toBe('event.category:authentication');
    expect(ctx?.rowField).toBe('user.name');
    expect(ctx?.colField).toBe('host.name');
    expect(ctx?.selectedCell).toEqual({ row: 'alice', col: 'RU', value: 40 });
    expect(ctx?.pivotFilters).toEqual(['(user.name:"alice")']);
    // Carries the P4 significance through for reviewer context.
    expect(ctx?.significant?.direction).toBe('over');
    expect(ctx?.significant?.ratio).toBe(5);
  });

  it('returns null when the axes are not both set (nothing to capture)', () => {
    const noRow: HuntPivotConfig = { ...config, rowField: null };
    expect(buildDetectionContext(data(), noRow, 'q', [], 'a', 'b', 1)).toBeNull();
  });
});
