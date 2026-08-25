/**
 * ThreatIntelAdminPage.test.tsx
 *
 * Four focused Vitest cases for the ThreatIntelAdminPage (T05, Req 5.11):
 *   1. Renders TAXII Feeds tab by default
 *   2. Stats panel renders KPI tiles (Total Active IOCs, IPs, Domains, Hashes,
 *      Expired Today)
 *   3. "Add TAXII Feed" button is visible on the default tab
 *   4. "Add MISP Feed" button appears when the MISP Feeds tab is clicked
 *
 * Validates: Requirements 5.11
 */

import React from 'react';

import * as ReactQuery from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ThreatIntelAdminPage } from './ThreatIntelAdminPage';

import type { IocStatsDTO, MispFeedDTO, TaxiiFeedDTO } from '@/types/threatIntel.types';

// ---------------------------------------------------------------------------
// Module mocks — hoisted by Vitest; must appear before any import that
// transitively depends on the mocked module
// ---------------------------------------------------------------------------

// Auth store — user always has ROLE_ADMIN so the access-denied branch is not
// triggered and the page renders its full content in all four tests
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { hasRole: (r: string) => boolean; hasAnyRole: (r: string[]) => boolean }) => unknown) =>
    selector({
      hasRole: (_role: string) => true,
      hasAnyRole: (_roles: string[]) => true,
    }),
}));

// threatIntelService — prevent real HTTP calls; the service functions never
// execute because useQuery / useMutation are also mocked
vi.mock('@/services/threatIntel.service', () => ({
  threatIntelService: {
    listTaxiiFeeds: vi.fn(),
    listMispFeeds: vi.fn(),
    getIocStats: vi.fn(),
    createTaxiiFeed: vi.fn(),
    createMispFeed: vi.fn(),
    updateTaxiiFeed: vi.fn(),
    updateMispFeed: vi.fn(),
    deleteTaxiiFeed: vi.fn(),
    deleteMispFeed: vi.fn(),
    syncTaxiiFeed: vi.fn(),
    syncMispFeed: vi.fn(),
  },
}));

// TanStack Query — replace useQuery and useMutation with controllable fakes
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactQuery>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
  };
});

// PatternFly icons — replace SVG icons with lightweight stubs so jsdom does
// not fail on canvas / SVG APIs
vi.mock('@patternfly/react-icons', () => ({
  LockIcon: () => <span data-testid="icon-lock" />,
  CheckCircleIcon: () => <span data-testid="icon-check-circle" />,
  ExclamationCircleIcon: () => <span data-testid="icon-exclamation-circle" />,
  SyncAltIcon: () => <span data-testid="icon-sync-alt" />,
}));

// Side-panel and modal sub-components that require browser APIs
vi.mock('@/components/ha-drawer/HaDrawer', () => ({
  HaDrawer: ({ children, isOpen, title }: { children: React.ReactNode; isOpen: boolean; title: string }) =>
    isOpen ? (
      <div data-testid="ha-drawer">
        <span data-testid="ha-drawer-title">{title}</span>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/components/ha-modal/HaModal', () => ({
  HaModal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="ha-modal">{children}</div> : null,
}));

vi.mock('@/components/ha-page-header/SiemPageHeader', () => ({
  SiemPageHeader: ({ title }: { title: string }) => (
    <div data-testid="siem-page-header">{title}</div>
  ),
}));

vi.mock('@/components/toast-stack/toastStore', () => ({
  useToastStore: () => ({ addToast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_STATS: IocStatsDTO = {
  totalActive: 1247,
  byType: { ip: 623, domain: 401, hash: 189, url: 22, email: 12 },
  expiredToday: 8,
};

const SAMPLE_TAXII_FEEDS: TaxiiFeedDTO[] = [
  {
    id: 1,
    name: 'MITRE ATT&CK',
    taxiiUrl: 'https://cti-taxii.mitre.org/taxii/',
    collectionId: 'enterprise-attack',
    enabled: true,
    lastSyncAt: '2026-07-24T10:00:00Z',
    lastSyncStatus: 'OK',
    lastSyncCount: 234,
    createdAt: '2026-07-20T00:00:00Z',
  },
];

const SAMPLE_MISP_FEEDS: MispFeedDTO[] = [
  {
    id: 1,
    name: 'Internal MISP',
    mispUrl: 'https://misp.example.com',
    enabled: true,
    filterTags: 'tlp:green',
    lastSyncAt: '2026-07-24T08:00:00Z',
    lastSyncStatus: 'ERROR',
    lastSyncCount: 0,
  },
];

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

/**
 * Configure the vi.fn()-mocked useQuery to return pre-resolved data for the
 * three query keys used by ThreatIntelAdminPage.
 *
 * Called synchronously — no dynamic imports.  The mock for @tanstack/react-query
 * is already in place because vi.mock() is hoisted above all imports.
 */
function setupQueryMocks(
  overrides: {
    statsLoading?: boolean;
    statsError?: boolean;
    taxiiLoading?: boolean;
    taxiiError?: boolean;
    mispLoading?: boolean;
    mispError?: boolean;
    taxiiData?: TaxiiFeedDTO[];
    mispData?: MispFeedDTO[];
  } = {},
): void {
  // useQuery is the vi.fn() injected by the mock above
  const mockedUseQuery = vi.mocked(ReactQuery.useQuery);

  mockedUseQuery.mockImplementation((options) => {
    const rawKey = options.queryKey;
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (key === 'ioc-stats') {
      return {
        data: overrides.statsLoading ? undefined : SAMPLE_STATS,
        isLoading: overrides.statsLoading ?? false,
        isError: overrides.statsError ?? false,
        isPending: overrides.statsLoading ?? false,
        status: overrides.statsError ? 'error' : 'success',
        fetchStatus: 'idle',
      } as ReturnType<typeof ReactQuery.useQuery>;
    }

    if (key === 'taxii-feeds') {
      return {
        data: overrides.taxiiLoading ? undefined : (overrides.taxiiData ?? SAMPLE_TAXII_FEEDS),
        isLoading: overrides.taxiiLoading ?? false,
        isError: overrides.taxiiError ?? false,
        isPending: overrides.taxiiLoading ?? false,
        status: overrides.taxiiError ? 'error' : 'success',
        fetchStatus: 'idle',
      } as ReturnType<typeof ReactQuery.useQuery>;
    }

    if (key === 'misp-feeds') {
      return {
        data: overrides.mispLoading ? undefined : (overrides.mispData ?? SAMPLE_MISP_FEEDS),
        isLoading: overrides.mispLoading ?? false,
        isError: overrides.mispError ?? false,
        isPending: overrides.mispLoading ?? false,
        status: overrides.mispError ? 'error' : 'success',
        fetchStatus: 'idle',
      } as ReturnType<typeof ReactQuery.useQuery>;
    }

    // Fallback for any other query key
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      isPending: false,
      status: 'success',
      fetchStatus: 'idle',
    } as ReturnType<typeof ReactQuery.useQuery>;
  });
}

function renderPage(queryClient: QueryClient = makeQueryClient()): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/threat-intel']}>
        <ThreatIntelAdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
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

describe('ThreatIntelAdminPage', () => {
  // -------------------------------------------------------------------------
  // Test 1 — TAXII Feeds tab is rendered by default
  // -------------------------------------------------------------------------
  it('renders the TAXII Feeds tab as active by default', async () => {
    setupQueryMocks();
    renderPage();

    // Both tab labels must be present in the tab bar
    expect(screen.getByText('TAXII Feeds')).toBeInTheDocument();
    expect(screen.getByText('MISP Feeds')).toBeInTheDocument();

    // The TAXII feed table (aria-label="TAXII Feeds") must be visible on mount
    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'TAXII Feeds' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Test 2 — Stats panel renders all five KPI tiles with correct values
  // -------------------------------------------------------------------------
  it('renders IOC stats KPI tiles with labels and values from the stats endpoint', async () => {
    setupQueryMocks();
    renderPage();

    // All five tile labels defined in IocStatsPanel
    await waitFor(() => {
      expect(screen.getByText('Total Active IOCs')).toBeInTheDocument();
      expect(screen.getByText('IPs')).toBeInTheDocument();
      expect(screen.getByText('Domains')).toBeInTheDocument();
      expect(screen.getByText('Hashes')).toBeInTheDocument();
      expect(screen.getByText('Expired Today')).toBeInTheDocument();
    });

    // Numeric values from SAMPLE_STATS must appear in the document
    expect(screen.getByText('1247')).toBeInTheDocument(); // totalActive
    expect(screen.getByText('623')).toBeInTheDocument();  // ip
    expect(screen.getByText('401')).toBeInTheDocument();  // domain
    expect(screen.getByText('189')).toBeInTheDocument();  // hash
    expect(screen.getByText('8')).toBeInTheDocument();    // expiredToday
  });

  // -------------------------------------------------------------------------
  // Test 3 — "Add TAXII Feed" button is visible on the default tab
  // -------------------------------------------------------------------------
  it('shows the "Add TAXII Feed" button on the TAXII Feeds tab', async () => {
    setupQueryMocks();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Add TAXII Feed/i }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Test 4 — "Add MISP Feed" button appears after clicking the MISP Feeds tab
  // -------------------------------------------------------------------------
  it('shows the "Add MISP Feed" button after switching to the MISP Feeds tab', async () => {
    setupQueryMocks();
    renderPage();

    // Button must not be visible while the TAXII tab is active
    expect(screen.queryByRole('button', { name: /Add MISP Feed/i })).toBeNull();

    // Switch to the MISP Feeds tab
    const mispTabButton = screen.getByText('MISP Feeds');
    fireEvent.click(mispTabButton);

    // "Add MISP Feed" must now be visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Add MISP Feed/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows persisted MISP Status from lastSyncStatus after switching tabs', async () => {
    setupQueryMocks();
    renderPage();

    fireEvent.click(screen.getByText('MISP Feeds'));

    await waitFor(() => {
      expect(screen.getByRole('table', { name: 'MISP Feeds' })).toBeInTheDocument();
    });

    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('Internal MISP')).toBeInTheDocument();
  });
});
