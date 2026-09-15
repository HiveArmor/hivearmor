/**
 * AgentCommandsTab tests (SPEC-07 W6 6.1) — renders per-agent command history
 * with honest status states and an empty state when there is none.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentCommandsTab } from './AgentCommandsTab';

const mocks = vi.hoisted(() => ({ fetchAgentCommands: vi.fn() }));

vi.mock('@/services/agentDetail.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/agentDetail.service')>();
  return { ...actual, fetchAgentCommands: mocks.fetchAgentCommands };
});

function renderTab(agentId = '9') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AgentCommandsTab agentId={agentId} />
    </QueryClientProvider>,
  );
}

describe('AgentCommandsTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders command rows with their real status labels', async () => {
    mocks.fetchAgentCommands.mockResolvedValue([
      { cmdId: 'c1', agentId: '9', command: 'isolate-host', status: 'COMPLETED', result: 'ok', issuedBy: 'maya', issuedAt: '2026-09-01T10:00:00Z', updatedAt: null, reason: 'INC-1' },
      { cmdId: 'c2', agentId: '9', command: 'kill-process', status: 'FAILED', result: 'not found', issuedBy: 'sam', issuedAt: '2026-09-01T09:00:00Z', updatedAt: null, reason: null },
    ]);
    renderTab();
    await waitFor(() => expect(screen.getByText('isolate-host')).toBeDefined());
    expect(screen.getByText('Completed')).toBeDefined();
    expect(screen.getByText('Failed')).toBeDefined();
    expect(screen.getByText('maya')).toBeDefined();
  });

  it('shows an empty state (no fabricated row) when the agent has no commands', async () => {
    mocks.fetchAgentCommands.mockResolvedValue([]);
    renderTab();
    await waitFor(() => expect(screen.getByText(/No commands issued to this endpoint/i)).toBeDefined());
  });

  it('shows an error state on failure without changing anything', async () => {
    mocks.fetchAgentCommands.mockRejectedValue(new Error('boom'));
    renderTab();
    // The component's query has retry:1, so allow time for the single retry to exhaust.
    await waitFor(() => expect(screen.getByText(/Could not load command history/i)).toBeDefined(), { timeout: 4000 });
  });
});
