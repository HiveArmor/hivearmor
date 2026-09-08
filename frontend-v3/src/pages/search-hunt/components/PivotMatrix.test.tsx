import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PivotMatrix } from './PivotMatrix';
import type { HuntCrosstabResponse } from '../searchHunt.types';

function data(over: Partial<HuntCrosstabResponse> = {}): HuntCrosstabResponse {
  return {
    searchId: 'X', computedAt: 't', totalMatched: 10, pivotEligibleMatched: 8, totalRelation: 'eq',
    measure: { function: 'count', field: null, approximate: false },
    rowKeys: ['alice', 'bob'], colKeys: ['RU', 'IN'],
    cells: [
      { row: 'alice', col: 'RU', value: 5 },
      { row: 'bob', col: 'IN', value: 3 },
    ],
    rowTotals: [6, 4], colTotals: [7, 5], grandTotal: 8,
    totalSemantics: { cell: '', row: '', column: '', grand: '', additive: false },
    rowTruncated: false, colTruncated: false, rowCardinalityEstimate: 2, colCardinalityEstimate: 2,
    cardinalityApproximate: true,
    axisSelection: { strategy: 'distributed_terms', approximate: true, rowShardSize: 200, colShardSize: 200, rowDocCountErrorUpperBound: 0, colDocCountErrorUpperBound: 0 },
    execution: { tookMs: 1, timedOut: false, returnedCells: 2, returnedRows: 2, returnedColumns: 2, truncated: false },
    status: 'COMPLETE', partialFailures: [],
    ...over,
  };
}

describe('PivotMatrix', () => {
  it('renders row/column headers, cells and totals', () => {
    render(<PivotMatrix data={data()} rowField="host.name" colField="event.action" heat={false} onCellAction={vi.fn()} />);
    expect(screen.getByRole('rowheader', { name: 'alice' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /RU/ })).toBeInTheDocument();
    // grand total present
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('opens the cell menu and fires the chosen action for a non-zero cell', () => {
    const onCellAction = vi.fn();
    render(<PivotMatrix data={data()} rowField="host.name" colField="event.action" heat onCellAction={onCellAction} />);
    fireEvent.click(screen.getByLabelText('alice, RU: 5'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Exclude from Hunt/ }));
    expect(onCellAction).toHaveBeenCalledWith('exclude', 'alice', 'RU', 5);
  });

  it('sorts rows when a column header is clicked', () => {
    render(<PivotMatrix data={data()} rowField="host.name" colField="event.action" heat={false} onCellAction={vi.fn()} />);
    const inHeader = screen.getByRole('button', { name: 'IN' });
    fireEvent.click(inHeader); // sort desc by IN column → bob (3) above alice (0)
    const rowHeaders = screen.getAllByRole('rowheader').map((el) => el.textContent);
    expect(rowHeaders.indexOf('bob')).toBeLessThan(rowHeaders.indexOf('alice'));
  });

  it('renders a bucketed column axis as a time label, not a raw ISO string', () => {
    const iso = '2026-09-08T05:00:00.000Z';
    const onCellAction = vi.fn();
    render(
      <PivotMatrix
        data={data({
          colKeys: [iso], rowKeys: ['alice'],
          cells: [{ row: 'alice', col: iso, value: 5 }],
          colTotals: [5], rowTotals: [5],
          colBucketed: true, colBucketInterval: '1h',
        })}
        rowField="host.name"
        colField="@timestamp"
        heat={false}
        onCellAction={onCellAction}
      />,
    );
    // The column header shows a formatted time label, not the raw ISO key.
    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent ?? '');
    expect(headers.some((h) => h.includes(iso))).toBe(false);
    // But the cell action still carries the raw ISO key (for drill/keep/exclude fidelity).
    fireEvent.click(screen.getByLabelText((l) => l.endsWith(': 5')));
    fireEvent.click(screen.getByRole('menuitem', { name: /Keep in Hunt/ }));
    expect(onCellAction).toHaveBeenCalledWith('keep', 'alice', iso, 5);
  });
});
