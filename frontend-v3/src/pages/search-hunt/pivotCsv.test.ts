import { describe, it, expect } from 'vitest';

import { buildCrosstabCsv, csvField, crosstabCsvFilename } from './pivotCsv';
import type { HuntCrosstabResponse } from './searchHunt.types';

function resp(over: Partial<HuntCrosstabResponse> = {}): HuntCrosstabResponse {
  return {
    searchId: 'X', computedAt: 't', totalMatched: 10, pivotEligibleMatched: 8, totalRelation: 'eq',
    measure: { function: 'count', field: null, approximate: false },
    rowKeys: ['alice', 'bob'], colKeys: ['RU', 'IN'],
    cells: [
      { row: 'alice', col: 'RU', value: 5 },
      { row: 'alice', col: 'IN', value: 1 },
      { row: 'bob', col: 'RU', value: 2 },
    ],
    rowTotals: [6, 2], colTotals: [7, 1], grandTotal: 8,
    totalSemantics: { cell: '', row: '', column: '', grand: '', additive: false },
    rowTruncated: false, colTruncated: false, rowCardinalityEstimate: 2, colCardinalityEstimate: 2,
    cardinalityApproximate: true,
    axisSelection: { strategy: 'distributed_terms', approximate: true, rowShardSize: 200, colShardSize: 200, rowDocCountErrorUpperBound: 0, colDocCountErrorUpperBound: 0 },
    execution: { tookMs: 1, timedOut: false, returnedCells: 3, returnedRows: 2, returnedColumns: 2, truncated: false },
    status: 'COMPLETE', partialFailures: [],
    ...over,
  };
}

describe('pivotCsv', () => {
  it('builds a matrix with corner label, column keys, Total column and Total row', () => {
    const csv = buildCrosstabCsv(resp(), 'user.name', 'source.geo.country');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('user.name \\ source.geo.country,RU,IN,Total');
    expect(lines[1]).toBe('alice,5,1,6');   // row total 6 is NOT the sum of visible cells necessarily
    expect(lines[2]).toBe('bob,2,0,2');     // missing bob/IN cell renders 0
    expect(lines[3]).toBe('Total,7,1,8');   // grand total = pivotEligible, from server
  });

  it('neutralizes CSV formula injection', () => {
    expect(csvField('=cmd')).toBe("'=cmd");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('@x')).toBe("'@x");
    expect(csvField('safe')).toBe('safe');
  });

  it('quotes and doubles inner quotes for delimiter/newline values', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });

  it('escapes a formula-injection value that also needs quoting', () => {
    // Leading '=' neutralized first, then the comma forces quoting.
    expect(csvField('=a,b')).toBe('"\'=a,b"');
  });

  it('derives a safe timestamped filename', () => {
    const name = crosstabCsvFilename('host.name', 'event.action', 'count');
    expect(name).toMatch(/^hunt-pivot_host\.name_x_event\.action_count_.*\.csv$/);
    expect(name).not.toMatch(/[:]/);
  });
});
