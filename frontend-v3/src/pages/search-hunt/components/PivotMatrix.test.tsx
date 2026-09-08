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

  it('renders the previous-period delta on a cell when comparison values are present', () => {
    const withDelta = data({
      cells: [{ row: 'alice', col: 'RU', value: 120, comparisonValue: 100, delta: 20, deltaPercent: 20 }],
    });
    render(<PivotMatrix data={withDelta} rowField="host.name" colField="event.action" heat={false} onCellAction={vi.fn()} />);
    expect(screen.getByText(/\+20%/)).toBeInTheDocument();   // delta marker
    expect(screen.getByText('120')).toBeInTheDocument();      // raw value still shown
  });

  it('renders a UEBA deviation marker on a row with a real z-score, none on a null row', () => {
    const withDev = data({ rowDeviations: [{ metric: 'failed_logon_ratio', zScore: 3.2 }, null] });
    render(<PivotMatrix data={withDev} rowField="user.name" colField="event.action" heat={false} onCellAction={vi.fn()} />);
    expect(screen.getByText(/\+3\.2σ/)).toBeInTheDocument();
    // the second row (aligned to the null deviation) shows no sigma marker
    const secondRowKey = withDev.rowKeys[1];
    expect(screen.getByRole('rowheader', { name: new RegExp(secondRowKey) }).textContent).not.toMatch(/σ/);
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

  it('renders the (missing) sentinel row key as "(no value)"', () => {
    const sentinel = '\u0000(missing)';
    render(
      <PivotMatrix
        data={data({
          rowKeys: [sentinel], colKeys: ['RU'],
          cells: [{ row: sentinel, col: 'RU', value: 4 }],
          rowTotals: [4], colTotals: [4],
          rowHasMissingBucket: true, missingKey: sentinel,
        })}
        rowField="user.name"
        colField="event.action"
        heat={false}
        onCellAction={vi.fn()}
      />,
    );
    expect(screen.getByRole('rowheader', { name: '(no value)' })).toBeInTheDocument();
  });

  it('shows a multi-valued disclosure note only when an axis is multi-valued', () => {
    const { rerender } = render(
      <PivotMatrix data={data()} rowField="host.name" colField="event.action" heat={false} onCellAction={vi.fn()} />,
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    rerender(
      <PivotMatrix data={data({ colMultiValued: true })} rowField="host.name" colField="event.category" heat={false} onCellAction={vi.fn()} />,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/event\.category is multi-valued/i);
  });
});
