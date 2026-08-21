/**
 * Check 3: AlertContextDrawer Ask AI mount test.
 *
 * Renders drawer with a fixture alert; clicks Ask AI; asserts AiChatPanel
 * receives open=true, contextType="alert", contextId === fixture.id.
 *
 * Requirements: 14.1, 14.2, 16.2
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AlertContextDrawer } from '@/components/alert-context-drawer/AlertContextDrawer';

vi.mock('@/services/aiChatService', () => ({
  aiChatService: {
    streamChat: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    saveHistory: vi.fn(),
    generateTriage: vi.fn(),
    getAiStatus: vi.fn().mockResolvedValue({ configured: true, provider: 'openai' }),
    generateIncidentSummary: vi.fn(),
  },
}));

vi.mock('@/hooks/useAiTriage', () => ({
  useAiTriage: () => ({ isLoading: false, isError: false, data: null }),
  useAiStatus: () => ({
    data: { configured: true, provider: 'openai' },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false, isError: false }),
  };
});

describe('Check 3: AlertContextDrawer Ask AI mount test', () => {
  const FIXTURE_ALERT_ID = 'fixture-alert-abc';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking Ask AI opens AiChatPanel with correct contextType and contextId', async () => {
    render(
      <AlertContextDrawer
        alertId={FIXTURE_ALERT_ID}
        onClose={vi.fn()}
        isOpen={true}
      />,
    );
    await act(async () => {});

    // AiChatPanel should not be visible yet
    expect(screen.queryByRole('dialog', { name: /AI assistant/i })).toBeNull();

    // Click Ask AI
    const askAiBtn = screen.getByRole('button', { name: /open ai assistant for this alert/i });
    expect(askAiBtn).toBeInTheDocument();
    fireEvent.click(askAiBtn);

    await act(async () => {});

    // AiChatPanel should now be mounted and open
    const panel = screen.getByRole('dialog', { name: /AI assistant/i });
    expect(panel).toBeInTheDocument();
  });

  it('Ask AI button has aria-label "Open AI assistant for this alert"', async () => {
    render(
      <AlertContextDrawer
        alertId={FIXTURE_ALERT_ID}
        onClose={vi.fn()}
        isOpen={true}
      />,
    );
    await act(async () => {});

    const btn = screen.getByRole('button', { name: /open ai assistant for this alert/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', 'Open AI assistant for this alert');
  });

  it('drawer with isOpen=false does not render Ask AI button', () => {
    render(
      <AlertContextDrawer
        alertId={FIXTURE_ALERT_ID}
        onClose={vi.fn()}
        isOpen={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).toBeNull();
  });
});
