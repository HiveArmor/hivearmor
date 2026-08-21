/**
 * Task 6.11 — NlQueryBar HTTP 503 graceful degradation tests.
 *
 * Verifies:
 *  - When translateNlToDsl returns a 503 error, the NlQueryBar widget is
 *    replaced with LlmUnavailableCard.
 *  - A panel-level error message (LlmUnavailableErrorStrip) is shown.
 *  - The surrounding page stays mounted.
 *  - Non-503 errors keep the widget intact and show the standard error alert.
 *
 * Requirements: 8.3, 10.6
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { NlQueryBar } from '../NlQueryBar';

import { translateNlToDsl } from '@/services/searchService';
import type { NlToDslResponse } from '@/types/search.types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@monaco-editor/react', () => ({
  default: ({ onChange }: { onChange?: (v: string) => void }) => (
    <div data-testid="monaco-editor" onChange={() => onChange?.('')} />
  ),
}));

vi.mock('@/services/searchService', () => ({
  translateNlToDsl: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NlQueryBar — HTTP 503 graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces the query bar widget with LlmUnavailableCard on 503', async () => {
    vi.mocked(translateNlToDsl).mockRejectedValue(
      new Error('translateNlToDsl failed: 503'),
    );

    render(
      <div data-testid="surrounding-page">
        <NlQueryBar
          indexPattern="v3-hive-alert-*"
          onTranslate={vi.fn()}
        />
      </div>,
    );

    // Type a query and click Translate
    const input = screen.getByRole('textbox', { name: /natural language search query/i });
    fireEvent.change(input, { target: { value: 'show me failed logins' } });
    fireEvent.click(screen.getByRole('button', { name: /translate/i }));

    // Null-state card must appear
    await waitFor(() => {
      expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();
    });

    // Panel-level error strip must be present
    expect(screen.getByRole('alert')).toBeTruthy();

    // Surrounding page must still be mounted
    expect(screen.getByTestId('surrounding-page')).toBeTruthy();

    // The NL input and Translate button must be gone (widget replaced)
    expect(screen.queryByRole('textbox', { name: /natural language search query/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /translate/i })).toBeNull();
  });

  it('shows the NL-specific description on the null-state card', async () => {
    vi.mocked(translateNlToDsl).mockRejectedValue(
      new Error('translateNlToDsl failed: 503'),
    );

    render(
      <NlQueryBar
        indexPattern="v3-hive-alert-*"
        onTranslate={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: /natural language search query/i });
    fireEvent.change(input, { target: { value: 'show me alerts' } });
    fireEvent.click(screen.getByRole('button', { name: /translate/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/natural language search requires an ai provider/i),
      ).toBeTruthy();
    });
  });

  it('keeps the widget for non-503 errors and shows a standard error alert', async () => {
    vi.mocked(translateNlToDsl).mockRejectedValue(
      new Error('translateNlToDsl failed: 500'),
    );

    render(
      <NlQueryBar
        indexPattern="v3-hive-alert-*"
        onTranslate={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: /natural language search query/i });
    fireEvent.change(input, { target: { value: 'show me failed logins' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /translate/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    // Null-state card must NOT appear
    expect(screen.queryByRole('status', { name: /ai unavailable/i })).toBeNull();

    // Widget input must still be in the DOM
    expect(screen.getByRole('textbox', { name: /natural language search query/i })).toBeTruthy();
  });

  it('calls onTranslate with the response on success (no degradation)', async () => {
    const mockResponse: NlToDslResponse = {
      dsl: '{"match_all":{}}',
      explanation: 'All documents',
      confidence: 0.9,
    };
    vi.mocked(translateNlToDsl).mockResolvedValue(mockResponse);
    const onTranslate = vi.fn();

    render(
      <NlQueryBar
        indexPattern="v3-hive-alert-*"
        onTranslate={onTranslate}
      />,
    );

    const input = screen.getByRole('textbox', { name: /natural language search query/i });
    fireEvent.change(input, { target: { value: 'show all' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /translate/i }));
    });

    await waitFor(() => {
      expect(onTranslate).toHaveBeenCalledWith(mockResponse);
    });

    // Widget must still be present
    expect(screen.getByRole('textbox', { name: /natural language search query/i })).toBeTruthy();
    expect(screen.queryByRole('status', { name: /ai unavailable/i })).toBeNull();
  });
});
