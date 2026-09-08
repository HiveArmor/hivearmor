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
    onSetRow: vi.fn(), onSetCol: vi.fn(), onSetValueFn: vi.fn(), onSetDistinctField: vi.fn(), onSwap: vi.fn(),
    ...over,
  };
  render(<PivotShelves {...props} />);
  return props;
}

describe('PivotShelves', () => {
  it('the keyboard Add menu excludes date and non-aggregatable text fields', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a field to Rows' }));
    const menu = screen.getByRole('menu', { name: 'Choose a field' });
    expect(menu).toHaveTextContent('host.name');
    expect(menu).toHaveTextContent('source.ip');
    expect(menu).not.toHaveTextContent('@timestamp'); // date excluded
    expect(menu).not.toHaveTextContent('message');    // non-aggregatable text excluded
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
