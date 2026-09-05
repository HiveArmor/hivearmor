/**
 * HuntVerdictLead tests
 *  a) renders the verdict + confidence AND the trust-calibration line (REDESIGN §6:
 *     confidence never stands alone).
 *  b) a reasoning step with rowRefs renders a clickable citation → fires onCiteRows
 *     with those refs (move 3).
 *  c) Promote-to-case fires onPromote (move 8).
 *  d) 👍/👎 posts feedback and shows the ack.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HuntVerdictLead } from './HuntVerdictLead';
import type { HuntVerdictResponse } from '../ai/huntAiContract.types';

const submitAiFeedback = vi.fn().mockResolvedValue({ recorded: true });
vi.mock('../ai/huntAiService', () => ({
  submitAiFeedback: (...args: unknown[]) => submitAiFeedback(...args),
}));

const VERDICT: HuntVerdictResponse = {
  schemaVersion: '1',
  state: 'ready',
  verdictId: 'V-1',
  verdict: 'suspicious',
  confidence: 0.79,
  calibration: { agreementRate: 0.84, sampleSize: 212, window: '90d', scope: 'credential-access verdicts', overrideTrend: 'flat' },
  title: 'Cluster',
  summary: 'A suspicious cluster.',
  conclusion: 'Likely compromise.',
  clusterSize: 37,
  totalConsidered: 1284,
  reasoning: [
    { id: 'r1', label: 'Baseline deviation', detail: 'foreign ASNs', state: 'done', rowRefs: ['evt-1', 'evt-2'] },
    { id: 'r2', label: 'No refs step', state: 'done' },
  ],
  evidence: [
    { id: 'e1', label: 'IP', value: '185.220.101.44', rowRef: 'evt-3', kind: 'field', provenanceLensed: false },
    { id: 'e2', label: 'Risk', value: '91', rowRef: 'evt-3', kind: 'enrichment', provenanceLensed: true },
  ],
  provenance: { model: 'm', generatedAt: 'now', agentVersion: 'v', caveat: 'verify before acting' },
};

describe('HuntVerdictLead', () => {
  beforeEach(() => submitAiFeedback.mockClear());

  it('shows confidence WITH the trust-calibration track record', () => {
    render(<HuntVerdictLead verdict={VERDICT} onCiteRows={vi.fn()} onPromote={vi.fn()} />);
    // calibration line present — confidence never stands alone
    expect(screen.getByText(/agreed with analysts/i)).toBeInTheDocument();
    expect(screen.getByText(/84%/)).toBeInTheDocument();
    expect(screen.getByText(/n=212/)).toBeInTheDocument();
    expect(screen.getByText(/credential-access verdicts/)).toBeInTheDocument();
  });

  it('fires onCiteRows with the step rowRefs when a citation is clicked', () => {
    const onCiteRows = vi.fn();
    render(<HuntVerdictLead verdict={VERDICT} onCiteRows={onCiteRows} onPromote={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cited rows/i }));
    expect(onCiteRows).toHaveBeenCalledWith(['evt-1', 'evt-2']);
  });

  it('fires onPromote from Promote to case', () => {
    const onPromote = vi.fn();
    render(<HuntVerdictLead verdict={VERDICT} onCiteRows={vi.fn()} onPromote={onPromote} />);
    fireEvent.click(screen.getByRole('button', { name: /promote to case/i }));
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it('posts feedback and acknowledges', async () => {
    render(<HuntVerdictLead verdict={VERDICT} onCiteRows={vi.fn()} onPromote={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm verdict/i }));
    expect(submitAiFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'verdict', targetId: 'V-1', vote: 'up' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/track record/i);
  });

  it('collapses and expands the verdict body via the toggle', () => {
    render(<HuntVerdictLead verdict={VERDICT} onCiteRows={vi.fn()} onPromote={vi.fn()} />);
    // Expanded by default — the trust-calibration line is present.
    expect(screen.getByText(/agreed with analysts/i)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /ai verdict/i });
    fireEvent.click(toggle);
    // Collapsed — body (and its trust line) is unmounted.
    expect(screen.queryByText(/agreed with analysts/i)).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByText(/agreed with analysts/i)).toBeInTheDocument();
  });

  it('caps the expanded verdict in a height-limited scroll container so the grid stays visible (F-1)', () => {
    const { container } = render(<HuntVerdictLead verdict={VERDICT} onCiteRows={vi.fn()} onPromote={vi.fn()} />);
    // Expanded: the scroll wrapper is present and actually wraps the verdict body.
    const scroll = container.querySelector('.hunt-verdict-lead__scroll');
    expect(scroll).not.toBeNull();
    expect(scroll).toContainElement(screen.getByText(/agreed with analysts/i));
    // Collapsed: the scroll wrapper (and its capped body) is gone entirely.
    fireEvent.click(screen.getByRole('button', { name: /ai verdict/i }));
    expect(container.querySelector('.hunt-verdict-lead__scroll')).toBeNull();
  });
});
