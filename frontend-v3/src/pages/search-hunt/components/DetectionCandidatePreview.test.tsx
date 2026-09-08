import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { DetectionCandidatePreview } from './DetectionCandidatePreview';
import type { PivotDetectionContext } from '../lib/pivotDetectionContext';

// Mock the EXISTING createRule service — the point is the panel reaches ONLY the draft-creating path.
const createRuleMock = vi.fn(async (rule: unknown) => ({ id: 'RULE-DRAFT-1', status: 'draft', rule }));
vi.mock('../../detection-rules/detectionRules.service', () => ({
  createRule: (rule: unknown) => createRuleMock(rule),
}));

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
  it('shows the captured context and a governance note; has NO deploy/activate/approve button', () => {
    render(<DetectionCandidatePreview context={ctx} onClose={vi.fn()} />);
    expect(screen.getByText('user.name')).toBeInTheDocument();
    expect(screen.getByText(/event\.category:authentication/)).toBeInTheDocument();
    expect(screen.getByText(/over-represented/)).toBeInTheDocument();
    expect(screen.getByText(/does not deploy anything/i)).toBeInTheDocument();
    // Governance guarantee: the ONLY governed action here is "Draft rule for review" — never deploy/activate/approve.
    expect(screen.queryByRole('button', { name: /deploy|activate|approve|publish/i })).not.toBeInTheDocument();
  });

  it('creates a DRAFT via the existing createRule and links into Detection review (never activates)', async () => {
    render(<DetectionCandidatePreview context={ctx} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /draft rule for review/i }));
    await waitFor(() => expect(screen.getByText(/Draft created/)).toBeInTheDocument());
    expect(createRuleMock).toHaveBeenCalledTimes(1);
    // The created payload is a non-active draft — ruleActive false.
    expect(createRuleMock.mock.calls[0]?.[0]).toMatchObject({ ruleActive: false });
    // Forward action is a REVIEW link, not a deploy button.
    const link = screen.getByRole('link', { name: /open in detection review/i });
    expect(link).toHaveAttribute('href', '/detection-rules/RULE-DRAFT-1');
    expect(screen.queryByRole('button', { name: /deploy|activate|approve|publish/i })).not.toBeInTheDocument();
  });

  it('dismisses via the close button', () => {
    const onClose = vi.fn();
    render(<DetectionCandidatePreview context={ctx} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss detection candidate/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
