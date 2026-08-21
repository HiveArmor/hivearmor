/**
 * SystemSettingsAiTab.ollamaHiding.test.tsx
 *
 * Property 15: Non-Ollama providers hide Ollama-specific UI
 *
 * For any status response where `provider != "ollama"`, SystemSettingsAiTab
 * SHALL NOT render the Ollama base URL input, model dropdown, pull button, or
 * pull progress indicator.
 *
 * For `provider === "ollama"`, all four Ollama-specific elements SHALL be
 * rendered.
 *
 * Test cases:
 *   1. provider === "disabled"  → Ollama panel is NOT rendered
 *   2. provider === "openai"    → Ollama panel is NOT rendered
 *   3. provider === "azure"     → Ollama panel is NOT rendered
 *   4. provider === "ollama"    → Ollama base URL input IS rendered
 *   5. provider === "ollama"    → Ollama pull button IS rendered
 *   6. provider === "ollama"    → Ollama model dropdown IS rendered
 *   7. provider === "disabled"  → no base URL input present
 *   8. provider === "openai"    → no pull button present
 *
 * **Validates: Requirements 7.5**
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SystemSettingsAiTab } from '../SystemSettingsAiTab';

import type { LlmStatusDTO } from '@/types/llmAdmin.types';

// ---------------------------------------------------------------------------
// Module mocks — vi.mock is hoisted by Vitest to run before imports
// ---------------------------------------------------------------------------

/**
 * Mock @tanstack/react-query
 *
 * We replace useQuery with a controllable vi.fn() so individual test cases can
 * inject different provider values in the status response without network calls.
 * useMutation is stubbed to a no-op (save button behavior is out of scope here).
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
 * The component calls llmAdminService.getStatus (via useQuery) and, when the
 * Ollama panel is visible, llmAdminService.listModels (also via useQuery).
 * Both are mocked here to prevent real fetch calls; their actual return values
 * are controlled through mockUseQuery above.
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

type ProviderValue = LlmStatusDTO['provider'];

/**
 * Configure mockUseQuery to return a successful status response for the given
 * provider value, and an idle models response for any secondary query.
 *
 * SystemSettingsAiTab registers two useQuery calls:
 *   - ['llm', 'status']  → drives the provider form and Ollama panel visibility
 *   - ['llm', 'models']  → inside OllamaPanel, only mounted when provider=ollama
 *
 * The component syncs local `provider` state from `status.provider` on first
 * load (`initializedRef`), so the provider passed here controls whether the
 * Ollama panel renders.
 */
function mockStatusForProvider(provider: ProviderValue): void {
  mockUseQuery.mockImplementation((opts: { queryKey: unknown[] }) => {
    const subKey = opts.queryKey[1];

    if (subKey === 'status') {
      return {
        data: {
          configured: provider !== 'disabled',
          provider,
          latencyMs: null,
        } satisfies LlmStatusDTO,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }

    // models query (only reached when provider === 'ollama')
    return {
      data: { provider: 'ollama', models: [] },
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

describe('SystemSettingsAiTab — Property 15: Non-Ollama providers hide Ollama-specific UI', () => {

  // -------------------------------------------------------------------------
  // Non-Ollama providers: Ollama panel must be entirely absent
  // -------------------------------------------------------------------------

  it('does not render the Ollama settings panel when provider is "disabled"', () => {
    mockStatusForProvider('disabled');
    render(<SystemSettingsAiTab />);

    // Section heading
    expect(screen.queryByText(/Ollama Settings/i)).toBeNull();
    // Base URL input
    expect(screen.queryByLabelText(/Base URL/i)).toBeNull();
    // Pull model button (aria-label "Pull model from Ollama registry" or "Pulling…")
    expect(screen.queryByRole('button', { name: /Pull/i })).toBeNull();
  });

  it('does not render the Ollama settings panel when provider is "openai"', () => {
    mockStatusForProvider('openai');
    render(<SystemSettingsAiTab />);

    expect(screen.queryByText(/Ollama Settings/i)).toBeNull();
    expect(screen.queryByLabelText(/Base URL/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Pull/i })).toBeNull();
  });

  it('does not render the Ollama settings panel when provider is "azure"', () => {
    mockStatusForProvider('azure');
    render(<SystemSettingsAiTab />);

    expect(screen.queryByText(/Ollama Settings/i)).toBeNull();
    expect(screen.queryByLabelText(/Base URL/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Pull/i })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Ollama provider: Ollama panel elements must be present
  // -------------------------------------------------------------------------

  it('renders the Ollama base URL input when provider is "ollama"', () => {
    mockStatusForProvider('ollama');
    render(<SystemSettingsAiTab />);

    // The section heading confirms the Ollama panel is mounted
    expect(screen.getByText(/Ollama Settings/i)).toBeTruthy();

    // The Base URL input is rendered with its label
    const baseUrlInput = screen.getByLabelText(/Base URL/i);
    expect(baseUrlInput).toBeTruthy();
  });

  it('renders the pull button when provider is "ollama"', () => {
    mockStatusForProvider('ollama');
    render(<SystemSettingsAiTab />);

    // The pull button is rendered (aria-label contains "Pull")
    const pullButton = screen.getByRole('button', { name: /Pull model from Ollama registry/i });
    expect(pullButton).toBeTruthy();
  });

  it('renders the model dropdown section when provider is "ollama"', () => {
    mockStatusForProvider('ollama');
    render(<SystemSettingsAiTab />);

    // The Active Model label is rendered as part of the model dropdown section
    expect(screen.getByText(/Active Model/i)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Explicit absence checks for specific elements
  // -------------------------------------------------------------------------

  it('renders no base URL input for provider "disabled"', () => {
    mockStatusForProvider('disabled');
    render(<SystemSettingsAiTab />);

    // The ollama-base-url input id must not appear in the DOM
    const inputById = document.getElementById('ollama-base-url');
    expect(inputById).toBeNull();
  });

  it('renders no pull button for provider "openai"', () => {
    mockStatusForProvider('openai');
    render(<SystemSettingsAiTab />);

    // No button with "Pull" anywhere in its accessible name
    expect(screen.queryByRole('button', { name: /Pull/i })).toBeNull();
  });
});
