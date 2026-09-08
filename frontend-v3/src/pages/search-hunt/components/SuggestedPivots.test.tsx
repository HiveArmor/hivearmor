import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { SuggestedPivots } from './SuggestedPivots';
import type { SuggestedPivot } from '../lib/suggestedPivots';

const cfg = (row: string, col: string) => ({
  v: 1, tenantId: null, rowField: row, colField: col, valueFn: 'count' as const, distinctField: null,
});

const suggestions: SuggestedPivot[] = [
  { id: 's1', title: 'user.name × host.name', rationale: 'A common investigative breakdown.', config: cfg('user.name', 'host.name') },
  { id: 's2', title: 'host.name × process.name', rationale: 'Both have useful coverage.', config: cfg('host.name', 'process.name') },
];

describe('SuggestedPivots', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<SuggestedPivots suggestions={[]} onApply={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip per suggestion and applies the chosen one', () => {
    const onApply = vi.fn();
    render(<SuggestedPivots suggestions={suggestions} onApply={onApply} />);
    expect(screen.getByRole('button', { name: /user\.name × host\.name/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /host\.name × process\.name/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].id).toBe('s2');
  });
});
