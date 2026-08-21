/**
 * Check 6 (frontend): Disabled-provider path frontend tests.
 *
 * - AiIncidentSummaryCard renders null when configured=false
 * - AiTriageSection renders null when statusConfigured=false
 * - AiChatPanel shows "AI is disabled…" error on chat submission when 503
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 13.7
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AiChatPanel } from './AiChatPanel';
import { AiIncidentSummaryCard } from './AiIncidentSummaryCard';
import { AiTriageSection } from './AiTriageSection';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/services/aiChatService', () => ({
  aiChatService: {
    streamChat: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    saveHistory: vi.fn(),
    generateTriage: vi.fn(),
    getAiStatus: vi.fn().mockResolvedValue({ configured: false, provider: 'disabled' }),
    generateIncidentSummary: vi.fn(),
  },
}));

vi.mock('@/hooks/useAiTriage', () => ({
  useAiTriage: () => ({ isLoading: false, isError: false, data: null, refetch: vi.fn() }),
  useAiStatus: () => ({
    data: { configured: false, provider: 'disabled' },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useIncidentAiSummary', () => ({
  useIncidentAiSummary: () => ({ isLoading: false, isError: false, data: null }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false, isError: false }),
  };
});

import { aiChatService } from '@/services/aiChatService';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Check 6 (frontend): Disabled provider graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiChatService.getHistory).mockResolvedValue([]);
  });

  it('AiIncidentSummaryCard renders null when configured=false', () => {
    const { container } = render(<AiIncidentSummaryCard incidentId="inc-1" />);
    // With configured=false, the component should render nothing
    expect(container.firstChild).toBeNull();
  });

  it('AiTriageSection renders null when statusConfigured=false', () => {
    const { container } = render(
      <AiTriageSection alertId="alert-1" statusConfigured={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('AiChatPanel shows LlmUnavailableCard and error strip when stream returns 503', async () => {
    // Mock streamChat to throw a 503-style error when iterated
    vi.mocked(aiChatService.streamChat).mockImplementation(
      (_messages, _contextType, _contextId) => {
        async function* errorStream() {
          throw new Error('AI chat failed: 503');
          yield { delta: '', done: true as const };
        }
        return errorStream();
      },
    );

    render(
      <AiChatPanel open={true} onClose={vi.fn()} contextType="general" />,
    );
    await act(async () => {});

    // Type and send a message
    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'test message' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    // Wait for the 503 degradation UI to appear:
    // - LlmUnavailableErrorStrip (role="alert") with error strip text
    // - LlmUnavailableCard (role="status") replacing the widget
    await waitFor(() => {
      const errorEl = screen.getByRole('alert');
      expect(errorEl.textContent).toContain('AI service is not available');
      expect(errorEl.textContent).toContain('503');
    });

    // The null-state card must replace the chat widget
    expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();
    // The chat input must no longer be visible (widget replaced)
    expect(screen.queryByRole('textbox', { name: /chat input/i })).toBeNull();
  });
});
