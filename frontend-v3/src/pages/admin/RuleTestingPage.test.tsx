/**
 * RuleTestingPage.test.tsx
 *
 * Five cases per Requirement 6.18:
 *   1. Two panels render (YAML editor and JSON editor visible)
 *   2. Load sample event populates JSON editor
 *   3. Run Test calls API with correct body
 *   4. Renders match result with icon and matched-field chips
 *   5. Renders access-denied for user with no ANALYST/ADMIN role
 *
 * **Validates: Requirements 6.18**
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be declared before importing the component under test
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    language,
  }: {
    value?: string;
    onChange?: (val: string) => void;
    language?: string;
  }) => (
    <textarea
      data-testid={`monaco-editor-${language ?? 'unknown'}`}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('@/services/sigmaService', () => ({
  testRule: vi.fn(),
}));

// We need to import after mocks are set
import RuleTestingPage from './RuleTestingPage';

import { AuthGuard } from '@/router/AuthGuard';
import * as sigmaService from '@/services/sigmaService';
import { useAuthStore } from '@/store/auth.store';
import type { RuleTestResultDTO } from '@/types/sigma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage(queryClient: QueryClient = makeQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/rules/test']}>
        <Routes>
          <Route path="/admin/rules/test" element={<RuleTestingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPageWithAuthGuard(
  queryClient: QueryClient = makeQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/rules/test']}>
        <Routes>
          <Route
            path="/admin/rules/test"
            element={
              <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_ADMIN']}>
                <RuleTestingPage />
              </AuthGuard>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Set a fully authenticated user with given roles
function setAuthUser(roles: string[]) {
  useAuthStore.setState({
    user: {
      id: 1,
      login: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@hivearmor.com',
      roles,
      langKey: 'en',
    },
    token: 'test-token',
    isAuthenticated: true,
    isLoading: false,
    selectedTenantId: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleTestingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset auth store to unauthenticated state
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      selectedTenantId: null,
    });
  });

  // -------------------------------------------------------------------------
  // Case 1: Two panels render
  // -------------------------------------------------------------------------
  it('renders both the YAML editor panel and the JSON editor panel', async () => {
    setAuthUser(['ROLE_ANALYST']);
    renderPage();

    // Panel labels are immediately visible (not behind Suspense)
    expect(screen.getByText('Detection Rule')).toBeInTheDocument();
    expect(screen.getByText('Test Event (JSON)')).toBeInTheDocument();

    // Run Test button is present
    expect(screen.getByRole('button', { name: /run test/i })).toBeInTheDocument();

    // Both Monaco editors mount once Suspense resolves (lazy import)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor-yaml')).toBeInTheDocument();
      expect(screen.getByTestId('monaco-editor-json')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Load sample event populates JSON editor
  // -------------------------------------------------------------------------
  it('populates the JSON editor when a sample event is selected from the dropdown', async () => {
    setAuthUser(['ROLE_ANALYST']);
    renderPage();

    const select = screen.getByRole('combobox', { name: /load sample event/i });
    const jsonEditor = screen.getByTestId('monaco-editor-json');

    // Before selection the editor contains the default Windows Logon JSON
    // (SAMPLE_EVENTS[0].value is the initial value)
    const initialValue = jsonEditor.getAttribute('value') ?? (jsonEditor as HTMLTextAreaElement).value;
    expect(initialValue).toContain('EventID');

    // Select "PowerShell Execution"
    fireEvent.change(select, { target: { value: 'PowerShell Execution' } });

    await waitFor(() => {
      const updatedValue = (jsonEditor as HTMLTextAreaElement).value;
      expect(updatedValue).toContain('CommandLine');
      expect(updatedValue).toContain('powershell.exe');
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Run Test calls API with correct body
  // -------------------------------------------------------------------------
  it('calls testRule with the current rule YAML and event JSON when Run Test is clicked', async () => {
    setAuthUser(['ROLE_ANALYST']);

    const mockTestRule = vi.mocked(sigmaService.testRule);
    const mockResult: RuleTestResultDTO = {
      matched: false,
      matchedFields: [],
      explanation: 'Rule did not match.',
    };
    mockTestRule.mockResolvedValueOnce(mockResult);

    renderPage();

    const yamlEditor = screen.getByTestId('monaco-editor-yaml') as HTMLTextAreaElement;
    const jsonEditor = screen.getByTestId('monaco-editor-json') as HTMLTextAreaElement;

    // Set specific values in the editors
    const testYaml = 'title: My Test Rule\ndetection:\n  selection:\n    EventID: "4624"\n  condition: selection\n';
    const testJson = '{"EventID":"4624","LogonType":"3"}';

    fireEvent.change(yamlEditor, { target: { value: testYaml } });
    fireEvent.change(jsonEditor, { target: { value: testJson } });

    const runButton = screen.getByRole('button', { name: /run test/i });
    await act(async () => {
      fireEvent.click(runButton);
    });

    await waitFor(() => {
      expect(mockTestRule).toHaveBeenCalledOnce();
      expect(mockTestRule).toHaveBeenCalledWith({
        ruleYaml: testYaml,
        eventJson: testJson,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Renders match result with icon and matched-field chips
  // -------------------------------------------------------------------------
  it('displays CheckCircleIcon, "Rule Matched" label, and matched-field chips on a positive result', async () => {
    setAuthUser(['ROLE_ANALYST']);

    const mockTestRule = vi.mocked(sigmaService.testRule);
    const mockResult: RuleTestResultDTO = {
      matched: true,
      matchedFields: ['selection.EventID=4624', 'selection.LogonType=3'],
      explanation: 'Rule matched. Selections contributing: selection',
    };
    mockTestRule.mockResolvedValueOnce(mockResult);

    renderPage();

    const runButton = screen.getByRole('button', { name: /run test/i });
    await act(async () => {
      fireEvent.click(runButton);
    });

    // Wait for result panel to appear
    await waitFor(() => {
      expect(screen.getByText('Rule Matched')).toBeInTheDocument();
    });

    // Matched-field chips should be rendered
    expect(screen.getByText('selection.EventID=4624')).toBeInTheDocument();
    expect(screen.getByText('selection.LogonType=3')).toBeInTheDocument();

    // Explanation text should appear
    expect(screen.getByText(/selections contributing: selection/i)).toBeInTheDocument();

    // "No Match" label should NOT be present
    expect(screen.queryByText('No Match')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 5: Access-denied for user with no ANALYST/ADMIN role
  // -------------------------------------------------------------------------
  it('renders access-denied page when user lacks ANALYST and ADMIN roles', () => {
    // Set a user with a role that is neither ANALYST nor ADMIN
    setAuthUser(['ROLE_USER']);

    renderPageWithAuthGuard();

    // AuthGuard renders AccessDeniedPage for users without the required roles
    expect(screen.getByText('Access Denied')).toBeInTheDocument();

    // The page body should NOT render
    expect(screen.queryByText('Detection Rule')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Event (JSON)')).not.toBeInTheDocument();
  });
});
