/**
 * PolicyTemplatesPage — PT-2 library + tabbed editor: honesty labels, all 11 tabs,
 * role gating. The agent-enforcement notes (SPEC-PT-2 §2) must be visible, not hidden.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PolicyTemplatesPage } from './PolicyTemplatesPage';

const mockUsePolicyTemplates = vi.fn();
const mockAuthRoles = vi.fn<() => string[]>(() => ['ROLE_ADMIN']);

vi.mock('@/hooks/usePolicyTemplates', () => ({
  usePolicyTemplates: (...args: unknown[]) => mockUsePolicyTemplates(...args),
  useCreatePolicyTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePolicyTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClonePolicyTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { roles: string[] } }) => unknown) =>
    selector({ user: { roles: mockAuthRoles() } }),
}));

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PolicyTemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockAuthRoles.mockReturnValue(['ROLE_ADMIN']);
  mockUsePolicyTemplates.mockReturnValue({
    data: [
      { id: 1, policyName: 'Baseline', scope: 'ORG', platform: 'windows', versionNum: 2, updatedAt: null },
      { id: 2, policyName: 'Global CIS', scope: 'GLOBAL', platform: 'linux', versionNum: 5, updatedAt: null },
    ],
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('PolicyTemplatesPage', () => {
  it('shows the authoring-ahead honesty banner', () => {
    renderPage();
    expect(
      screen.getByText(/Policy templates — authoring ahead of enforcement/i),
    ).toBeInTheDocument();
  });

  it('lists templates with scope badges', () => {
    renderPage();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('Global CIS')).toBeInTheDocument();
    // GLOBAL appears both as a filter option and a row badge — assert the badge exists.
    const badge = document.querySelector('.policy-templates-page__scope--global');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('GLOBAL');
  });

  it('opens the editor with all 11 tabs', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /new template/i }));
    for (const tab of [
      'Generic', 'Monitor', 'Event', 'UEBA', 'User Log', 'FIM',
      'Change', 'Script', 'Certificate', 'Osquery', 'Scans',
    ]) {
      expect(screen.getByRole('tab', { name: new RegExp(tab, 'i') })).toBeInTheDocument();
    }
  });

  it('shows an "authored — not yet enforced" note on an unenforced tab (Scans)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /new template/i }));
    await user.click(screen.getByRole('tab', { name: /Scans/i }));
    const panel = screen.getByRole('tabpanel', { name: /Scans/i });
    expect(within(panel).getByText(/not yet enforced/i)).toBeInTheDocument();
  });

  it('shows NO enforcement note on the FIM tab (enforced today)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /new template/i }));
    await user.click(screen.getByRole('tab', { name: /^FIM/i }));
    const panel = screen.getByRole('tabpanel', { name: /^FIM/i });
    expect(within(panel).queryByText(/not yet enforced/i)).not.toBeInTheDocument();
  });

  it('gates GLOBAL scope for a non-admin', async () => {
    mockAuthRoles.mockReturnValue(['ROLE_SOC_MANAGER']);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /new template/i }));
    const panel = screen.getByRole('tabpanel', { name: /Generic/i });
    const scope = within(panel).getByLabelText(/^Scope$/i) as HTMLSelectElement;
    expect(scope.disabled).toBe(true);
  });

  it('denies read for a user without any policy role', () => {
    mockAuthRoles.mockReturnValue([]);
    renderPage();
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
  });

  it('locks the scope selector on edit (scope is fixed after creation)', async () => {
    const user = userEvent.setup();
    renderPage();
    const editButtons = screen.getAllByRole('button', { name: /^Edit$/i });
    await user.click(editButtons[0]);
    const panel = screen.getByRole('tabpanel', { name: /Generic/i });
    const scope = within(panel).getByLabelText(/^Scope$/i) as HTMLSelectElement;
    expect(scope.disabled).toBe(true);
    expect(within(panel).getByText(/fixed after creation/i)).toBeInTheDocument();
  });
});
