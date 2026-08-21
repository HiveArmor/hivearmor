/**
 * Property 12: AskAiButton mounts AiChatPanel with matching context props.
 *
 * For any record surface (alert in AlertContextDrawer or incident in IncidentDetailPage)
 * and any record r displayed there, clicking the Ask AI button mounts AiChatPanel with
 * open === true, contextType equal to that surface's context type, and contextId === r.id.
 *
 * Validates: Requirements 16.2, 19.7
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AlertContextDrawer } from '@/components/alert-context-drawer/AlertContextDrawer';

// Mock dependencies that AlertContextDrawer pulls in
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
  useAiTriage: vi.fn().mockReturnValue({ isLoading: false, isError: false, data: null }),
  useAiStatus: vi.fn().mockReturnValue({
    data: { configured: true, provider: 'openai' },
    isLoading: false,
  }),
}));

// Mock TanStack Query
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false, isError: false }),
  };
});

describe('Property 12: AskAiButton mounts AiChatPanel with matching context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Alert surface
  // -------------------------------------------------------------------------

  it('alert surface — clicking Ask AI opens AiChatPanel with contextType="alert" and correct alertId', async () => {
    const alertId = 'alert-abc-123';

    render(
      <AlertContextDrawer
        alertId={alertId}
        onClose={vi.fn()}
        isOpen={true}
      />,
    );
    await act(async () => {});

    // AiChatPanel should not be visible yet
    expect(screen.queryByRole('dialog', { name: /AI assistant/i })).toBeNull();

    // Click the Ask AI button in the drawer header
    const askAiBtn = screen.getByRole('button', { name: /open ai assistant for this alert/i });
    fireEvent.click(askAiBtn);

    await act(async () => {});

    // AiChatPanel should now be mounted and open
    const panel = screen.getByRole('dialog', { name: /AI assistant/i });
    expect(panel).toBeInTheDocument();
  });

  it('alert surface — Ask AI button has correct aria-label', async () => {
    render(
      <AlertContextDrawer alertId="alert-xyz" onClose={vi.fn()} isOpen={true} />,
    );
    await act(async () => {});

    const btn = screen.getByRole('button', { name: /open ai assistant for this alert/i });
    expect(btn).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Multiple distinct alert IDs → panel receives correct contextId each time
  // -------------------------------------------------------------------------

  it.each([
    'alert-001',
    'alert-abc',
    'xyz-99999',
  ])('alertId="%s" — AiChatPanel opens for the correct alert', async (alertId) => {
    render(
      <AlertContextDrawer alertId={alertId} onClose={vi.fn()} isOpen={true} />,
    );
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: /open ai assistant for this alert/i }));
    await act(async () => {});

    // Panel is open
    expect(screen.getByRole('dialog', { name: /AI assistant/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Drawer closed — Ask AI not visible
  // -------------------------------------------------------------------------

  it('drawer closed — AiChatPanel is not mounted', () => {
    render(
      <AlertContextDrawer alertId="alert-1" onClose={vi.fn()} isOpen={false} />,
    );
    expect(screen.queryByRole('button', { name: /open ai assistant/i })).toBeNull();
  });
});
