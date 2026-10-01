/**
 * HostAssociationsPage — PT-3: renders ranked tables, the effective-policy preview, and the
 * Apply flow. Hooks are mocked; the page's job is wiring + honest display.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HostAssociationsPage } from './HostAssociationsPage';

const mockUseHostAssociations = vi.fn();
const mockUsePolicyTemplates = vi.fn();
const mockApply = vi.fn();
const mockResolve = vi.fn();
const mockAuthRoles = vi.fn<() => string[]>(() => ['ROLE_ADMIN']);

vi.mock('@/hooks/useHostTemplateAssociations', () => ({
  useHostAssociations: (...a: unknown[]) => mockUseHostAssociations(...a),
  usePolicyTemplates: () => ({ data: [] }),
  useCreateHostAssociation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHostAssociation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHostAssociation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApplyHostAssociation: () => ({ mutateAsync: mockApply, isPending: false }),
  useResolveHost: () => ({ mutateAsync: mockResolve, isPending: false }),
}));

vi.mock('@/hooks/usePolicyTemplates', () => ({
  usePolicyTemplates: (...a: unknown[]) => mockUsePolicyTemplates(...a),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { roles: string[] } }) => unknown) =>
    selector({ user: { roles: mockAuthRoles() } }),
}));

vi.mock('@/lib/toast', () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

const TABLE = {
  id: 1,
  name: 'Default binding',
  scope: 'ORG' as const,
  versionNum: 3,
  lastAppliedAt: null,
  rowsJson: JSON.stringify({
    scope: 'ORG',
    rows: [
      { rank: 1, name: 'Critical', match: { group: 'Critical_Servers' }, templates: ['sec-log-full', 'compliance-scan'] },
      { rank: 2, name: 'Other', match: { any: true }, templates: ['sec-log-basic'] },
    ],
  }),
};

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HostAssociationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthRoles.mockReturnValue(['ROLE_ADMIN']);
  mockUsePolicyTemplates.mockReturnValue({ data: [{ policyName: 'sec-log-basic' }] });
  mockUseHostAssociations.mockReturnValue({
    data: [TABLE],
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('HostAssociationsPage', () => {
  it('shows the first-match honesty banner', () => {
    renderPage();
    expect(screen.getByText(/ranked, first-match/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing reaches an agent until you press Apply/i)).toBeInTheDocument();
  });

  it('renders the ranked rows in order with match + templates', () => {
    renderPage();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Critical_Servers')).toBeInTheDocument();
    expect(screen.getByText(/sec-log-full ∪ compliance-scan/)).toBeInTheDocument();
    expect(screen.getByText('any host')).toBeInTheDocument();
  });

  it('Apply calls the mutation and shows the per-host result', async () => {
    mockApply.mockResolvedValue({
      associationId: 1,
      affectedHostCount: 2,
      pushedCount: 2,
      hosts: [
        { host: '10', matchedRank: 1, matchedRowName: 'Critical', templates: ['sec-log-full'], status: 'PUSHED' },
        { host: '20', matchedRank: 2, matchedRowName: 'Other', templates: ['sec-log-basic'], status: 'PUSHED' },
      ],
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /^Apply$/i }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith(1));
    expect(await screen.findByText(/Pushed APPLY_POLICY to 2 of 2/)).toBeInTheDocument();
  });

  it('preview resolves a host and shows the winning row', async () => {
    mockResolve.mockResolvedValue({
      host: '42',
      matchedRank: 1,
      matchedRowName: 'Critical',
      matchedBy: 'group',
      templates: ['sec-log-full', 'compliance-scan'],
      resolved: '{"fim":{"mode":"merge"}}',
      hasMissingTemplate: false,
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Preview a host/i), '42');
    await user.click(screen.getByRole('button', { name: /^Resolve$/i }));
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('42'));
    expect(await screen.findByText(/Winning row: rank 1/)).toBeInTheDocument();
  });

  it('denies read without a role', () => {
    mockAuthRoles.mockReturnValue([]);
    renderPage();
    expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
  });
});
