import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { AskHivePivot } from './AskHivePivot';

// Force the service into a deterministic "ready" suggestion regardless of HUNT_AI_MODE.
vi.mock('../ai/huntAiService', () => ({
  suggestPivotFromNl: vi.fn(async (q: string) => ({
    state: 'ready', rowField: 'user.name', colField: 'host.name', valueFn: 'count', distinctField: null,
    explanation: `Break events down to answer: "${q}".`, warnings: [],
    provenance: { provider: 'mock', generatedAt: 't', agentVersion: 'mock@1.0', caveat: 'edit before running' },
  })),
}));

describe('AskHivePivot', () => {
  it('is collapsed to an icon trigger, expands on click, then asks / proposes / applies (never auto-runs)', async () => {
    const onApply = vi.fn();
    render(<AskHivePivot tenantId={7} onApply={onApply} />);

    // Collapsed by default: only the compact trigger, no input yet.
    expect(screen.queryByRole('textbox', { name: /ask hive intelligence a pivot question/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ask hive intelligence — suggest a pivot/i }));

    // Expanded: the input row appears.
    fireEvent.change(screen.getByRole('textbox', { name: /ask hive intelligence a pivot question/i }), {
      target: { value: 'which users touched which hosts?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    await waitFor(() => expect(screen.getByText(/Proposed:/)).toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled(); // proposing must NOT auto-run

    fireEvent.click(screen.getByRole('button', { name: /apply to shelves/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const cfg = onApply.mock.calls[0][0];
    expect(cfg.rowField).toBe('user.name');
    expect(cfg.colField).toBe('host.name');
    expect(cfg.tenantId).toBe(7);
  });
});
