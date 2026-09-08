import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { PivotShelves } from './PivotShelves';
import type { HuntFieldDefinition } from '../searchHunt.types';

const fields: HuntFieldDefinition[] = [
  { name: 'host.name', label: 'Host', type: 'keyword', category: 'host', description: '', operators: [':', '!='], coverage: 99 },
  { name: 'event.action', label: 'Action', type: 'keyword', category: 'event', description: '', operators: [':', '!='], coverage: 90 },
  { name: 'source.ip', label: 'Source IP', type: 'ip', category: 'network', description: '', operators: [':', '!='], coverage: 88 },
  { name: '@timestamp', label: 'Timestamp', type: 'date', category: 'event', description: '', operators: [':', '>', '<'], coverage: 100 },
  { name: 'message', label: 'Message', type: 'text', category: 'event', description: '', operators: [], coverage: 100 },
];

function setup(over: Partial<React.ComponentProps<typeof PivotShelves>> = {}) {
  const props = {
    fields, rowField: 'host.name', colField: 'event.action', valueFn: 'count' as const, distinctField: null,
    rowBucketInterval: null, colBucketInterval: null, rowMissing: 'omit' as const, colMissing: 'omit' as const,
    onSetRow: vi.fn(), onSetCol: vi.fn(), onSetValueFn: vi.fn(), onSetDistinctField: vi.fn(),
    onSetRowBucketInterval: vi.fn(), onSetColBucketInterval: vi.fn(),
    onSetRowMissing: vi.fn(), onSetColMissing: vi.fn(), onSwap: vi.fn(),
    ...over,
  };
  render(<PivotShelves {...props} />);
  return props;
}

describe('PivotShelves', () => {
  it('the keyboard Add menu includes date fields (bucketable) but excludes non-aggregatable text', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a field to Rows' }));
    const menu = screen.getByRole('menu', { name: 'Choose a field' });
    expect(menu).toHaveTextContent('host.name');
    expect(menu).toHaveTextContent('source.ip');
    expect(menu).toHaveTextContent('@timestamp');  // date allowed on an axis (needs an interval)
    expect(menu).not.toHaveTextContent('message'); // non-aggregatable text excluded
  });

  it('assigning a date field to an axis reveals the interval picker', () => {
    const p = setup({ rowField: '@timestamp' });
    expect(screen.getByRole('combobox', { name: /time interval for @timestamp/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /time interval for @timestamp/i }), { target: { value: '1h' } });
    expect(p.onSetRowBucketInterval).toHaveBeenCalledWith('1h');
  });

  it('a term axis offers a (missing) toggle that sets the missing mode', () => {
    const p = setup({ rowField: 'host.name' });
    const toggle = screen.getByRole('checkbox', { name: /include a \(missing\) bucket for host\.name/i });
    fireEvent.click(toggle);
    expect(p.onSetRowMissing).toHaveBeenCalledWith('include');
  });

  it('a date axis does NOT offer the (missing) toggle (deferred)', () => {
    // Both axes are the date field, so no term axis remains to offer a (missing) toggle.
    setup({ rowField: '@timestamp', colField: '@timestamp' });
    expect(screen.queryByRole('checkbox', { name: /include a \(missing\) bucket/i })).not.toBeInTheDocument();
  });

  it('shows coverage/cardinality on an occupied axis, with low-coverage and high-cardinality markers', () => {
    const statByField = new Map([
      ['host.name', { coverage: 22, cardinality: 4200 }],   // low coverage AND high cardinality
      ['event.action', { coverage: 90, cardinality: 12 }],  // healthy
    ]);
    setup({ statByField, axisTopN: 50 });
    // Rows axis = host.name → sparse + heavy truncation.
    expect(screen.getByText(/~4,200 values/)).toBeInTheDocument();
    expect(screen.getByText(/22% coverage \(sparse\)/)).toBeInTheDocument();
    expect(screen.getByText(/top 50 only/)).toBeInTheDocument();
    // Columns axis = event.action → healthy, no sparse/truncation markers on it.
    expect(screen.getByText(/90% coverage/)).toBeInTheDocument();
    expect(screen.getByText(/90% coverage/).textContent).not.toMatch(/sparse/);
  });

  it('shows no field-intelligence hint when stats are absent (no search snapshot yet)', () => {
    setup();
    expect(screen.queryByText(/coverage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/values/)).not.toBeInTheDocument();
  });

  it('assigning from the menu calls onSetRow', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a field to Rows' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /source\.ip/ }));
    expect(p.onSetRow).toHaveBeenCalledWith('source.ip');
  });

  it('swap button calls onSwap', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Swap rows and columns' }));
    expect(p.onSwap).toHaveBeenCalled();
  });

  it('shows the distinct-of picker only when Distinct is selected', () => {
    setup({ valueFn: 'distinct', distinctField: null });
    expect(screen.getByLabelText('Distinct count field')).toBeInTheDocument();
  });
});
