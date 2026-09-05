/**
 * HuntVerdictPanel tests — the AI verdict as a right-side panel (reuses the event-flyout shell).
 *  a) renders verdict + confidence + trust calibration (confidence never stands alone).
 *  b) a reasoning step with rowRefs fires onCiteRows.
 *  c) close button + Escape fire onClose.
 *  d) Promote to case fires onPromote.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HuntVerdictPanel } from './HuntVerdictPanel';
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
  ],
  evidence: [
    { id: 'e1', label: 'IP', value: '185.220.101.44', rowRef: 'evt-3', kind: 'field', provenanceLensed: false },
  ],
  provenance: { model: 'm', generatedAt: 'now', agentVersion: 'v', caveat: 'verify before acting' },
};

describe('HuntVerdictPanel', () => {
  beforeEach(() => submitAiFeedback.mockClear());

  it('renders verdict, confidence and the trust-calibration track record', () => {
    render(<HuntVerdictPanel verdict={VERDICT} onCiteRows={vi.fn()} onPromote={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /suspicious/i })).toBeInTheDocument();
    expect(screen.getByText(/agreed with analysts/i)).toBeInTheDocument();
    expect(screen.getByText(/84%/)).toBeInTheDocument();
    expect(screen.getByText(/n=212/)).toBeInTheDocument();
  });

  it('fires onCiteRows with the step rowRefs', () => {
    const onCiteRows = vi.fn();
    render(<HuntVerdictPanel verdict={VERDICT} onCiteRows={onCiteRows} onPromote={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cited rows/i }));
    expect(onCiteRows).toHaveBeenCalledWith(['evt-1', 'evt-2']);
  });

  it('closes via the close button and via Escape', () => {
    const onClose = vi.fn();
    render(<HuntVerdictPanel verdict={VERDICT} onCiteRows={vi.fn()} onPromote={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close ai verdict/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('fires onPromote from Promote to case', () => {
    const onPromote = vi.fn();
    render(<HuntVerdictPanel verdict={VERDICT} onCiteRows={vi.fn()} onPromote={onPromote} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /promote to case/i }));
    expect(onPromote).toHaveBeenCalledTimes(1);
  });
});
