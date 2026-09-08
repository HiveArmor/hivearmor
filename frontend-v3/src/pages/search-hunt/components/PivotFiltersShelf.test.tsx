import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PivotFiltersShelf } from './PivotFiltersShelf';

describe('PivotFiltersShelf', () => {
  it('renders nothing when there are no filters', () => {
    const { container } = render(
      <PivotFiltersShelf filters={[]} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip per filter clause', () => {
    render(
      <PivotFiltersShelf
        filters={['(event.outcome:failure)', '(host.name:WS-014)']}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText('(event.outcome:failure)')).toBeInTheDocument();
    expect(screen.getByText('(host.name:WS-014)')).toBeInTheDocument();
  });

  it('removes one filter by index', () => {
    const onRemove = vi.fn();
    render(
      <PivotFiltersShelf filters={['(a:1)', '(b:2)']} onRemove={onRemove} onClear={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove pivot filter \(b:2\)/i }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('clears all filters', () => {
    const onClear = vi.fn();
    render(
      <PivotFiltersShelf filters={['(a:1)']} onRemove={vi.fn()} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
