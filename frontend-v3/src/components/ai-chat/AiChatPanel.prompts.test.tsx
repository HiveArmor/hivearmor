/**
 * Property 11: AiChatPanel suggested prompts match SuggestedPromptsMap for every context.
 *
 * For any c ∈ AiContextType, when AiChatPanel is rendered with contextType=c, open=true,
 * and empty messages, the DOM contains exactly 3 prompt chips matching SuggestedPromptsMap[c]
 * in order; clicking chip i populates the textarea with SuggestedPromptsMap[c][i].
 *
 * Validates: Requirements 11.6
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { AiChatPanel, SUGGESTED_PROMPTS } from './AiChatPanel';

import type { AiContextType } from '@/types/ai.types';

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

const CONTEXT_TYPES: AiContextType[] = ['alert', 'incident', 'general'];

describe('Property 11: Suggested prompts match SuggestedPromptsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const contextType of CONTEXT_TYPES) {
    const prompts = SUGGESTED_PROMPTS[contextType];

    it(`contextType="${contextType}" — renders exactly 3 suggestion chips with correct text`, async () => {
      render(
        <AiChatPanel
          open={true}
          onClose={vi.fn()}
          contextType={contextType}
        />,
      );
      await act(async () => {});

      for (const prompt of prompts) {
        expect(screen.getByRole('button', { name: prompt })).toBeInTheDocument();
      }
    });

    it(`contextType="${contextType}" — clicking chip[0] populates textarea with "${prompts[0]}"`, async () => {
      render(
        <AiChatPanel
          open={true}
          onClose={vi.fn()}
          contextType={contextType}
        />,
      );
      await act(async () => {});

      fireEvent.click(screen.getByRole('button', { name: prompts[0] }));

      const textarea = screen.getByRole('textbox', { name: /chat input/i });
      expect(textarea).toHaveValue(prompts[0]);
    });

    it(`contextType="${contextType}" — clicking chip[1] populates textarea with "${prompts[1]}"`, async () => {
      render(
        <AiChatPanel
          open={true}
          onClose={vi.fn()}
          contextType={contextType}
        />,
      );
      await act(async () => {});

      fireEvent.click(screen.getByRole('button', { name: prompts[1] }));

      const textarea = screen.getByRole('textbox', { name: /chat input/i });
      expect(textarea).toHaveValue(prompts[1]);
    });

    it(`contextType="${contextType}" — clicking chip[2] populates textarea with "${prompts[2]}"`, async () => {
      render(
        <AiChatPanel
          open={true}
          onClose={vi.fn()}
          contextType={contextType}
        />,
      );
      await act(async () => {});

      fireEvent.click(screen.getByRole('button', { name: prompts[2] }));

      const textarea = screen.getByRole('textbox', { name: /chat input/i });
      expect(textarea).toHaveValue(prompts[2]);
    });
  }
});
