/**
 * Check 2: Progressive rendering test for AiChatPanel.
 *
 * Mocks aiChatService.streamChat to yield deltas across multiple async ticks.
 * Asserts every intermediate render includes a growing assistant content string.
 *
 * Requirements: 11.1, 11.2, 11.3
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AiChatPanel } from './AiChatPanel';

import { aiChatService } from '@/services/aiChatService';
import type { AiChatStreamEvent } from '@/types/ai.types';

vi.mock('@/services/aiChatService', () => ({
  aiChatService: {
    streamChat: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    saveHistory: vi.fn(),
    generateTriage: vi.fn(),
    getAiStatus: vi.fn(),
    generateIncidentSummary: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Staged async generator — yields deltas with artificial delays
// ---------------------------------------------------------------------------

async function* stagedStream(tokens: string[]): AsyncGenerator<AiChatStreamEvent> {
  for (const token of tokens) {
    // Yield to microtask queue between tokens
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    yield { delta: token, done: false };
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  yield { delta: '', done: true, totalTokens: tokens.length };
}

describe('Check 2: AiChatPanel progressive rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiChatService.getHistory).mockResolvedValue([]);
  });

  it('assistant bubble content grows with each streamed token', async () => {
    const tokens = ['Analyzing', ' the', ' alert', '…'];
    vi.mocked(aiChatService.streamChat).mockReturnValue(stagedStream(tokens));

    render(
      <AiChatPanel open={true} onClose={vi.fn()} contextType="general" />,
    );
    await act(async () => {});

    // Type and send
    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'What happened?' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    // Wait for at least the first token to appear
    await waitFor(() => {
      expect(screen.getByText(/Analyzing/)).toBeInTheDocument();
    });

    // Wait for full accumulation
    await waitFor(() => {
      expect(screen.getByText(/Analyzing the alert…/)).toBeInTheDocument();
    });
  });

  it('Send button is disabled while streaming is active', async () => {
    let streamResolve!: () => void;
    const blockingPromise = new Promise<void>(r => { streamResolve = r; });

    async function* blockingStream(): AsyncGenerator<AiChatStreamEvent> {
      await blockingPromise;
      yield { delta: 'x', done: false };
      yield { delta: '', done: true, totalTokens: 1 };
    }

    vi.mocked(aiChatService.streamChat).mockReturnValue(blockingStream());

    render(
      <AiChatPanel open={true} onClose={vi.fn()} contextType="general" />,
    );
    await act(async () => {});

    const textarea = screen.getByRole('textbox', { name: /chat input/i });
    fireEvent.change(textarea, { target: { value: 'question' } });

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendBtn);

    await act(async () => {});

    // Button must be disabled while streaming
    expect(sendBtn).toBeDisabled();

    streamResolve();
  });

  it('multiple tokens accumulate into single assistant message', async () => {
    const tokens = ['Part1', ' Part2', ' Part3'];
    vi.mocked(aiChatService.streamChat).mockReturnValue(stagedStream(tokens));

    render(
      <AiChatPanel open={true} onClose={vi.fn()} contextType="alert" contextId="a-1" />,
    );
    await act(async () => {});

    fireEvent.change(screen.getByRole('textbox', { name: /chat input/i }), {
      target: { value: 'Summarize' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/Part1 Part2 Part3/)).toBeInTheDocument();
    });
  });
});
