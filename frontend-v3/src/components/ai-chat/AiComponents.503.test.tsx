/**
 * Task 6.11 — HTTP 503 graceful degradation tests for LLM-backed frontend surfaces.
 *
 * Verifies:
 *  - AiTriageSection: shows LlmUnavailableCard + panel-level strip on 503;
 *    triage panel hidden; surrounding page stays mounted.
 *  - AiIncidentSummaryCard: shows LlmUnavailableCard + strip on 503;
 *    surrounding page stays mounted.
 *  - AiChatPanel: replaces chat widget with LlmUnavailableCard on 503;
 *    header/close button still rendered (page not crashed).
 *
 * Requirements: 8.3, 10.6
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
    getAiStatus: vi.fn().mockResolvedValue({ configured: true, provider: 'ollama' }),
    generateIncidentSummary: vi.fn(),
  },
}));

vi.mock('@/hooks/useIncidentAiSummary', () => ({
  useIncidentAiSummary: vi.fn(),
}));

vi.mock('@/hooks/useAiTriage', () => ({
  useAiTriage: vi.fn(),
  useAiStatus: vi.fn().mockReturnValue({
    data: { configured: true, provider: 'ollama' },
    isLoading: false,
    isError: false,
  }),
}));

import { useAiTriage } from '@/hooks/useAiTriage';
import { useIncidentAiSummary } from '@/hooks/useIncidentAiSummary';
import { aiChatService } from '@/services/aiChatService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const make503Error = () => new Error('AI chat failed: 503');

// ---------------------------------------------------------------------------
// AiTriageSection — 503 handling
// ---------------------------------------------------------------------------

describe('AiTriageSection — HTTP 503 graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows LlmUnavailableCard when query errors with 503', () => {
    vi.mocked(useAiTriage).mockReturnValue({
      isLoading: false,
      isError: true,
      error: make503Error(),
      data: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAiTriage>);

    render(
      <div data-testid="surrounding-page">
        <AiTriageSection alertId="alert-1" statusConfigured={true} />
      </div>,
    );

    // Null-state card must be rendered
    expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();

    // Panel-level error strip must be present
    expect(screen.getByRole('alert')).toBeTruthy();

    // Surrounding page must still be mounted
    expect(screen.getByTestId('surrounding-page')).toBeTruthy();

    // The triage summary content must NOT be present (panel hidden)
    expect(screen.queryByText(/generating ai triage/i)).toBeNull();
    expect(screen.queryByText(/ai triage/i, { selector: 'span' })).toBeNull();
  });

  it('renders null when statusConfigured=false (normal disabled path)', () => {
    vi.mocked(useAiTriage).mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAiTriage>);

    const { container } = render(
      <AiTriageSection alertId="alert-1" statusConfigured={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AiIncidentSummaryCard — 503 handling
// ---------------------------------------------------------------------------

describe('AiIncidentSummaryCard — HTTP 503 graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows LlmUnavailableCard when incident summary errors with 503', () => {
    vi.mocked(useIncidentAiSummary).mockReturnValue({
      isLoading: false,
      isError: true,
      error: make503Error(),
      data: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useIncidentAiSummary>);

    render(
      <div data-testid="surrounding-page">
        <AiIncidentSummaryCard incidentId="inc-1" />
      </div>,
    );

    // Null-state card must be rendered
    expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();

    // Panel-level error strip must be present
    expect(screen.getByRole('alert')).toBeTruthy();

    // Surrounding page must still be mounted
    expect(screen.getByTestId('surrounding-page')).toBeTruthy();

    // Summary content must NOT be present
    expect(screen.queryByText(/generating ai analysis/i)).toBeNull();
  });

  it('shows generic error state for non-503 errors', () => {
    vi.mocked(useIncidentAiSummary).mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      data: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useIncidentAiSummary>);

    render(<AiIncidentSummaryCard incidentId="inc-1" />);

    // Generic error text, not the 503-specific null card
    expect(screen.getByText(/ai analysis unavailable/i)).toBeTruthy();
    expect(screen.queryByRole('status', { name: /ai unavailable/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AiChatPanel — 503 handling
// ---------------------------------------------------------------------------

describe('AiChatPanel — HTTP 503 graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiChatService.getHistory).mockResolvedValue([]);
  });

  it('replaces chat widget with LlmUnavailableCard after 503 error from stream', async () => {
    vi.mocked(aiChatService.streamChat).mockImplementation(() => {
      async function* errorStream() {
        throw make503Error();
        // unreachable yield to satisfy generator type
        yield { delta: '', done: true as const };
      }
      return errorStream();
    });

    render(
      <div data-testid="surrounding-page">
        <AiChatPanel open={true} onClose={vi.fn()} contextType="general" />
      </div>,
    );
    await act(async () => {});

    // Send a message to trigger the 503
    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'test message' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    // Null-state card must appear
    await waitFor(() => {
      expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();
    });

    // Panel-level error strip must be present
    expect(screen.getByRole('alert')).toBeTruthy();

    // The surrounding page must still be mounted
    expect(screen.getByTestId('surrounding-page')).toBeTruthy();

    // The panel header and close button must still be rendered (page not crashed)
    expect(screen.getByRole('button', { name: /close ai assistant/i })).toBeTruthy();

    // The chat textarea must NO LONGER be visible (widget replaced by card)
    expect(screen.queryByRole('textbox', { name: /chat input/i })).toBeNull();
  });

  it('shows generic error for non-503 stream errors (widget stays)', async () => {
    vi.mocked(aiChatService.streamChat).mockImplementation(() => {
      async function* errorStream() {
        throw new Error('AI chat failed: 500');
        yield { delta: '', done: true as const };
      }
      return errorStream();
    });

    render(<AiChatPanel open={true} onClose={vi.fn()} contextType="general" />);
    await act(async () => {});

    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    // Null-state card must NOT appear for non-503 errors
    expect(screen.queryByRole('status', { name: /ai unavailable/i })).toBeNull();

    // Chat textarea must still be visible (widget not replaced)
    expect(screen.getByRole('textbox', { name: /chat input/i })).toBeTruthy();
  });
});
