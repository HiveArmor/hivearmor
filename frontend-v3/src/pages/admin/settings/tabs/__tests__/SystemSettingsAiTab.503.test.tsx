/**
 * SystemSettingsAiTab.503.test.tsx
 *
 * Property 13: Frontend degrades gracefully on HTTP 503
 *
 * For any LLM-backed endpoint that returns HTTP 503, the enclosing page SHALL
 * continue to render the surrounding surfaces, the LLM widget SHALL be replaced
 * by a null-state card, the AI triage panel SHALL be hidden, and a panel-level
 * error message SHALL be visible.
 *
 * This file validates Property 13 for the SystemSettingsAiTab component
 * specifically. 503 handling for AiTriageSection, AiChatPanel, and NlQueryBar
 * was already tested in task 6.11.
 *
 * Test cases:
 *   1. 503 from getStatus — surrounding page stays mounted (no crash)
 *   2. 503 from getStatus — AI tab renders a null-state card (not a JS crash)
 *   3. 503 from getStatus — a descriptive error message containing "503" is visible
 *   4. 503 from getStatus — the Ollama panel (LLM widget) is hidden / not rendered
 *   5. Non-503 error (500) — retry button is visible for transient server errors
 *   6. Non-503 error (403) — retry button is visible for auth / other errors
 *   7. Successful load — the AI Provider section renders (baseline positive case)
 *
 * **Validates: Requirements 8.3, 10.6**
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SystemSettingsAiTab } from '../SystemSettingsAiTab';

import { LlmAdminError } from '@/types/llmAdmin.types';

// ---------------------------------------------------------------------------
// Module mocks — vi.mock is hoisted by Vitest to run before imports
// ---------------------------------------------------------------------------

/**
 * Mock @tanstack/react-query
 *
 * We replace useQuery with a controllable vi.fn() so that individual test cases
 * can inject isLoading / isError / data / error states without network calls.
 * useMutation is stubbed to a no-op (save button testing is out of scope here).
 * useQueryClient returns a stub with invalidateQueries.
 */
const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

/**
 * Mock @/services/llmAdmin.service
 *
 * The component calls llmAdminService.getStatus (via useQuery) and
 * llmAdminService.listModels (inside OllamaPanel, also via useQuery).
 * Because we control useQuery directly above, these are only referenced
 * to avoid import resolution errors.
 */
vi.mock('@/services/llmAdmin.service', () => ({
  llmAdminService: {
    getStatus: vi.fn(),
    listModels: vi.fn(),
    updateConfig: vi.fn(),
    pullModel: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate useQuery returning an error state.
 * SystemSettingsAiTab registers two queries: llmStatus and (inside OllamaPanel)
 * llmModels. We match by queryKey[0] so each query gets the right state.
 */
function mockStatusError(error: Error): void {
  mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[0];
    if (key === 'llm') {
      // Both status and models queries share the 'llm' key prefix
      // The status query is ['llm', 'status'], models is ['llm', 'models']
      const subKey = opts.queryKey[1];
      if (subKey === 'status') {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error,
          refetch: vi.fn(),
        };
      }
    }
    // Any other query (e.g. models in OllamaPanel) returns idle
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  });
}

/**
 * Simulate useQuery returning a successful status response.
 */
function mockStatusSuccess(): void {
  mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
    const subKey = opts.queryKey[1];
    if (subKey === 'status') {
      return {
        data: { configured: true, provider: 'disabled', latencyMs: null },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    // models query
    return {
      data: { provider: 'disabled', models: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SystemSettingsAiTab — Property 13: graceful HTTP 503 degradation', () => {

  // -------------------------------------------------------------------------
  // Case 1: 503 error — surrounding page stays mounted (no crash)
  // -------------------------------------------------------------------------
  it('keeps the surrounding page mounted when getStatus returns HTTP 503', () => {
    mockStatusError(new LlmAdminError(503));

    render(
      <div data-testid="surrounding-page">
        <main data-testid="main-content">
          <SystemSettingsAiTab />
        </main>
      </div>,
    );

    // Outer page elements must still be in the DOM (no crash / unmount)
    expect(screen.getByTestId('surrounding-page')).toBeTruthy();
    expect(screen.getByTestId('main-content')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 2: 503 error — AI tab renders an error state, not a JS crash
  // -------------------------------------------------------------------------
  it('renders an error state (not a crashed blank page) when getStatus returns HTTP 503', () => {
    mockStatusError(new LlmAdminError(503));

    const { container } = render(<SystemSettingsAiTab />);

    // The component must render *something* — the container must have child nodes
    expect(container.firstChild).not.toBeNull();

    // The component must not throw — if we get here without a thrown error, it passed
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Case 3: 503 error — a descriptive error message referencing "503" is visible
  // -------------------------------------------------------------------------
  it('shows a descriptive error message containing "503" when getStatus returns HTTP 503', () => {
    mockStatusError(new LlmAdminError(503));

    render(<SystemSettingsAiTab />);

    // The component renders: "Failed to load AI status: HTTP 503 — check backend connectivity"
    const errorText = screen.getByText(/503/);
    expect(errorText).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 4: 503 error — the Ollama-specific LLM widget panel is hidden
  //
  // The AI tab should not render the Ollama-specific widget (base URL input,
  // model dropdown, pull button) when it cannot load the status — this satisfies
  // the "LLM widget replaced by null-state card" criterion of Property 13.
  // -------------------------------------------------------------------------
  it('does not render the Ollama settings panel when getStatus returns HTTP 503', () => {
    mockStatusError(new LlmAdminError(503));

    render(<SystemSettingsAiTab />);

    // The Ollama settings section heading must NOT be rendered
    expect(screen.queryByText(/Ollama Settings/i)).toBeNull();

    // The Ollama Base URL input must NOT be rendered
    expect(screen.queryByLabelText(/Base URL/i)).toBeNull();

    // The pull model button must NOT be rendered
    expect(screen.queryByRole('button', { name: /Pull/i })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 5: Non-503 error (HTTP 500) — retry button is visible
  //
  // For non-503 errors (transient server errors), the component should offer
  // a way to retry rather than showing a permanent null-state.
  // -------------------------------------------------------------------------
  it('shows a Retry button for non-503 errors (HTTP 500)', () => {
    mockStatusError(new LlmAdminError(500));

    render(<SystemSettingsAiTab />);

    const retryButton = screen.getByRole('button', { name: /Retry/i });
    expect(retryButton).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 6: Non-503 error (HTTP 403) — retry button is visible
  //
  // Authorization errors should also surface a retry button so the user can
  // re-authenticate and try again.
  // -------------------------------------------------------------------------
  it('shows a Retry button for non-503 errors (HTTP 403)', () => {
    mockStatusError(new LlmAdminError(403));

    render(<SystemSettingsAiTab />);

    const retryButton = screen.getByRole('button', { name: /Retry/i });
    expect(retryButton).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 7: Successful load — baseline positive case
  //
  // When no error occurs, the AI Provider section must render correctly.
  // This guards against regressions introduced by the error-handling changes.
  // -------------------------------------------------------------------------
  it('renders the AI Provider section when getStatus succeeds', () => {
    mockStatusSuccess();

    render(<SystemSettingsAiTab />);

    // The main section heading rendered in the success path
    expect(screen.getByText('AI Provider')).toBeTruthy();

    // The save button is rendered in the success path.
    // HaButton sets aria-label="Save AI configuration" on the underlying <button>
    // element, so we match by aria-label rather than visible text.
    expect(screen.getByRole('button', { name: /Save AI configuration/i })).toBeTruthy();
  });
});
