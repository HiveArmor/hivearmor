import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { DetectionCandidatePreview } from './DetectionCandidatePreview';
import type { PivotDetectionContext } from '../lib/pivotDetectionContext';

const ctx: PivotDetectionContext = {
  searchId: 'HUNT-1', computedAt: '2026-09-08T00:00:00Z',
  query: 'event.category:authentication',
  rowField: 'user.name', colField: 'host.name',
  measure: { function: 'count', distinctField: null },
  pivotFilters: ['(user.name:"alice")'],
  selectedCell: { row: 'alice', col: 'RU', value: 40 },
  significant: { residual: 3.2, expected: 8, ratio: 5, direction: 'over' },
};

describe('DetectionCandidatePreview', () => {
  it('shows the captured context and an explicit "nothing deployed" governance note', () => {
    render(<DetectionCandidatePreview context={ctx} onClose={vi.fn()} />);
    expect(screen.getByText('user.name')).toBeInTheDocument();
    expect(screen.getByText(/event\.category:authentication/)).toBeInTheDocument();
    expect(screen.getByText(/over-represented/)).toBeInTheDocument();
    // Governance guarantee: no rule is drafted or deployed here.
    expect(screen.getByText(/No rule is drafted or deployed here/i)).toBeInTheDocument();
    // And crucially: there is NO deploy / activate / create-rule button in this safe-half panel.
    expect(screen.queryByRole('button', { name: /deploy|activate|create rule|publish/i })).not.toBeInTheDocument();
  });

  it('dismisses via the close button', () => {
    const onClose = vi.fn();
    render(<DetectionCandidatePreview context={ctx} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss detection candidate/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
