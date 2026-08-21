/**
 * Unit tests for AiChatPanel — progressive rendering and disabled Send.
 * Requirements: 11.1, 11.2
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AiChatPanel } from './AiChatPanel';

import type { AiChatStreamEvent } from '@/types/ai.types';

// ---------------------------------------------------------------------------
// Mock aiChatService module
// ---------------------------------------------------------------------------

const mockStreamChat = vi.fn();
const mockGetHistory = vi.fn().mockResolvedValue([]);

vi.mock('@/services/aiChatService', () => ({
  aiChatService: {
    streamChat: (...args: unknown[]) => mockStreamChat(...args),
    getHistory: (...args: unknown[]) => mockGetHistory(...args),
    saveHistory: vi.fn(),
    generateTriage: vi.fn(),
    getAiStatus: vi.fn(),
    generateIncidentSummary: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* makeStream(frames: AiChatStreamEvent[]) {
  for (const frame of frames) {
    yield frame;
  }
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  contextType: 'general' as const,
};

describe('AiChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHistory.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // Renders null when closed
  // -------------------------------------------------------------------------

  it('renders null when open=false', () => {
    const { container } = render(
      <AiChatPanel open={false} onClose={vi.fn()} contextType="general" />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Send button disabled when input is empty
  // -------------------------------------------------------------------------

  it('Send button is disabled when input is empty', async () => {
    render(<AiChatPanel {...defaultProps} />);
    await act(async () => {}); // flush history fetch
    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).toBeDisabled();
  });

  it('Send button is enabled when input has content', async () => {
    render(<AiChatPanel {...defaultProps} />);
    await act(async () => {});
    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'hello' } });
    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Send button disabled while streaming
  // -------------------------------------------------------------------------

  it('Send button is disabled while streaming', async () => {
    // Stream that never resolves during the test
    let resolveStream!: () => void;
    const streamPromise = new Promise<void>(res => { resolveStream = res; });

    async function* hangingStream() {
      await streamPromise; // hang
      yield { delta: 'x', done: false } as AiChatStreamEvent;
      yield { delta: '', done: true, totalTokens: 1 } as AiChatStreamEvent;
    }

    mockStreamChat.mockReturnValue(hangingStream());

    render(<AiChatPanel {...defaultProps} />);
    await act(async () => {});

    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'question' } });

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendBtn);

    await act(async () => {});

    // Should be disabled during stream
    expect(sendBtn).toBeDisabled();

    // Clean up
    resolveStream();
  });

  // -------------------------------------------------------------------------
  // Tokens accumulate incrementally
  // -------------------------------------------------------------------------

  it('tokens accumulate incrementally in the assistant bubble', async () => {
    mockStreamChat.mockReturnValue(
      makeStream([
        { delta: 'Hello', done: false },
        { delta: ' World', done: false },
        { delta: '', done: true, totalTokens: 2 },
      ]),
    );

    render(<AiChatPanel {...defaultProps} />);
    await act(async () => {});

    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/Hello World/)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Suggested prompts populate textarea on click
  // -------------------------------------------------------------------------

  it('clicking a suggested prompt populates the textarea', async () => {
    render(<AiChatPanel open={true} onClose={vi.fn()} contextType="alert" />);
    await act(async () => {});

    const chip = screen.getByRole('button', { name: 'Summarize this alert' });
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);

    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    expect(textarea).toHaveValue('Summarize this alert');
  });
});
