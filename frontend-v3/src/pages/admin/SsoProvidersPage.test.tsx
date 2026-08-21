/**
 * SsoProvidersPage.test.tsx
 *
 * Four Vitest test cases covering the four render states:
 *   1. Loaded state  — two providers render as table rows
 *   2. Loading state — Skeleton elements are rendered
 *   3. Empty state   — "No SSO providers configured" + inline Add Provider button
 *   4. Error state   — PatternFly Alert with danger variant
 *
 * **Validates: Requirements 3.16**
 */

import type { UseQueryResult } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import SsoProvidersPage from './SsoProvidersPage';

import * as useSsoProvidersModule from '@/hooks/useSsoProviders';
import type { OidcProviderAdminDTO } from '@/types/sso';

// ---------------------------------------------------------------------------
// Module mocks — vi.mock is hoisted by Vitest; these run before imports above
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useSsoProviders', () => ({
  useAllSsoProviders: vi.fn(),
  useCreateSsoProvider: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateSsoProvider: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteSsoProvider: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/components/ha-page-header/SiemPageHeader', () => ({
  SiemPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div data-testid="siem-page-header">
      <span>{title}</span>
      {actions}
    </div>
  ),
}));

vi.mock('@/components/ha-modal/HaModal', () => ({
  HaModal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="ha-modal">{children}</div> : null,
}));

vi.mock('@/components/toast-stack/toastStore', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}));

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
      <MemoryRouter initialEntries={['/admin/sso']}>
        <SsoProvidersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeProvider(overrides: Partial<OidcProviderAdminDTO>): OidcProviderAdminDTO {
  return {
    id: 1,
    providerName: 'Test Provider',
    clientId: 'client-id',
    clientSecret: null,
    discoveryUrl: 'https://example.com/.well-known/openid-configuration',
    scopes: 'openid profile email',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
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

describe('SsoProvidersPage', () => {
  // -------------------------------------------------------------------------
  // Case 1: Loaded state — two providers render as table rows
  // -------------------------------------------------------------------------
  it('renders a table row for each provider in the loaded state', () => {
    const providers: OidcProviderAdminDTO[] = [
      makeProvider({ id: 1, providerName: 'Google Workspace', enabled: true }),
      makeProvider({ id: 2, providerName: 'Okta', enabled: false }),
    ];

    vi.mocked(useSsoProvidersModule.useAllSsoProviders).mockReturnValue({
      data: providers,
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<OidcProviderAdminDTO[]>);

    renderPage();

    expect(screen.getByText('Google Workspace')).toBeInTheDocument();
    expect(screen.getByText('Okta')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 2: Loading state — Skeleton elements are present
  // -------------------------------------------------------------------------
  it('renders skeleton elements while data is loading', () => {
    vi.mocked(useSsoProvidersModule.useAllSsoProviders).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as UseQueryResult<OidcProviderAdminDTO[]>);

    renderPage();

    // PatternFly Skeleton renders elements with the pf-v6-c-skeleton class.
    // The component renders 3 LoadingRows × 5 columns = 15 Skeleton elements.
    const skeletons = document.querySelectorAll('.pf-v6-c-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Case 3: Empty state — message and inline Add Provider button visible
  // -------------------------------------------------------------------------
  it('renders the empty-state message and an inline Add Provider button when data is an empty array', () => {
    vi.mocked(useSsoProvidersModule.useAllSsoProviders).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<OidcProviderAdminDTO[]>);

    renderPage();

    // The empty-state copy rendered inside the table cell
    expect(screen.getByText(/No SSO providers configured/i)).toBeInTheDocument();

    // The inline "Add Provider" button inside the empty-state cell
    const addButtons = screen.getAllByRole('button', { name: /Add Provider/i });
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Case 4: Error state — PatternFly danger Alert is rendered
  // -------------------------------------------------------------------------
  it('renders a danger-variant PatternFly Alert when the query errors', () => {
    vi.mocked(useSsoProvidersModule.useAllSsoProviders).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as UseQueryResult<OidcProviderAdminDTO[]>);

    renderPage();

    // PatternFly v6 inline Alert does not set role="alert" on the wrapper — the
    // danger variant is identified by the pf-m-danger CSS class on the alert div.
    const alertEl = document.querySelector('.pf-v6-c-alert.pf-m-danger');
    expect(alertEl).not.toBeNull();

    // The alert title text rendered by the component
    expect(screen.getByText(/Failed to load SSO providers/i)).toBeInTheDocument();
  });
});
