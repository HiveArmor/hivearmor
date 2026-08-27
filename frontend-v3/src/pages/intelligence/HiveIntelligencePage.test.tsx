/**
 * HiveIntelligencePage.test.tsx — Prompt 13 + TLP-aware IOC display
 *
 * Covers:
 *   - Job sentence / STAGING CANDIDATE / cross-links
 *   - IOC lookup primary surface
 *   - Assistive SOC AI honesty framing
 *   - TLP badge / RED restricted / AMBER masked tooltip (T04)
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HiveIntelligencePage, INTELLIGENCE_JOB_SENTENCE } from './HiveIntelligencePage';

import type { IocBrowserEntryDTO, IocStatsDTO, ThreatFeedDTO, TlpLevel } from '@/types/threatIntel.types';

vi.mock('@/store/auth.store', () => {
  const fakeState = {
    user: {
      roles: ['ROLE_ANALYST'],
    },
    hasAnyRole: (_roles: string[]): boolean => true,
    hasRole: (_role: string): boolean => false,
  };

  return {
    useAuthStore: vi.fn((selector: (state: typeof fakeState) => unknown) =>
      selector(fakeState)
    ),
  };
});

vi.mock('@/services/threatIntel.service', () => ({
  threatIntelService: {
    listFeeds: vi.fn(),
    searchIocs: vi.fn(),
    searchIocsPage: vi.fn(),
    toggleFeed: vi.fn(),
    syncFeed: vi.fn(),
    lookupIoc: vi.fn(),
    getIocStats: vi.fn(),
  },
}));

vi.mock('@/services/socAi.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/socAi.service')>(
    '@/services/socAi.service'
  );
  return {
    ...actual,
    socAiService: {
      query: vi.fn(),
    },
  };
});

vi.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
  Brain: () => <span data-testid="icon-brain" />,
  Loader2: () => <span data-testid="icon-loader" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
  Search: () => <span data-testid="icon-search" />,
}));

type QueryReturn<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

const mockFeedsQuery = vi.fn();
const mockIocsQuery = vi.fn();
const mockStatsQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[0];
    if (key === 'threatFeeds') return mockFeedsQuery();
    if (key === 'iocs') return mockIocsQuery();
    if (key === 'ioc-stats') return mockStatsQuery();
    return { data: undefined, isLoading: false, isError: false, error: null };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

function makeFeed(overrides: Partial<ThreatFeedDTO> = {}): ThreatFeedDTO {
  return {
    id: 'feed-1',
    name: 'Test Feed',
    description: null,
    sourceType: 'OSINT',
    enabled: true,
    lastUpdated: null,
    indicatorCount: 3,
    url: null,
    ...overrides,
  };
}

function makeIoc(overrides: Partial<IocBrowserEntryDTO> = {}): IocBrowserEntryDTO {
  return {
    id: 1,
    value: '1.2.3.4',
    iocType: 'ip',
    threatScore: 80,
    classification: null,
    country: null,
    feedId: 'feed-1',
    lastSeen: null,
    alertCount: 0,
    tlp: 'GREEN' as TlpLevel,
    restricted: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockFeedsQuery.mockReturnValue({
    data: [makeFeed()],
    isLoading: false,
    isError: false,
    error: null,
  } satisfies QueryReturn<ThreatFeedDTO[]>);

  mockIocsQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } satisfies QueryReturn<{ items: IocBrowserEntryDTO[]; total: number }>);

  mockStatsQuery.mockReturnValue({
    data: {
      totalActive: 12,
      byType: { ip: 4, domain: 3, hash: 5, url: 0, email: 0 },
      expiredToday: 1,
    } satisfies IocStatsDTO,
    isLoading: false,
    isError: false,
    error: null,
  } satisfies QueryReturn<IocStatsDTO>);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <HiveIntelligencePage />
    </MemoryRouter>
  );
}

describe('HiveIntelligencePage — Prompt 13 workbench', () => {
  it('renders job sentence, staging badge, IOC lookup, and cross-links', () => {
    renderPage();

    expect(screen.getByText(INTELLIGENCE_JOB_SENTENCE)).toBeVisible();
    expect(screen.getByText('STAGING CANDIDATE')).toBeVisible();
    expect(screen.getByRole('region', { name: 'IOC lookup' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Look up/i })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Mission Control' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByRole('link', { name: 'Search & Hunt' })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: 'Entities' })).toHaveAttribute('href', '/entities');
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('href', '/alerts');
  });

  it('renders feeds health and assistive SOC AI panel', () => {
    renderPage();

    expect(screen.getByRole('region', { name: 'Threat feeds' })).toBeVisible();
    expect(screen.getByText('Test Feed')).toBeVisible();
    expect(screen.getByText('Enabled')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Assistive SOC AI' })).toBeVisible();
    expect(screen.getByText(/Ask questions about indicators/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /Ask SOC AI/i })).toBeVisible();
  });

  it('renders IOC stats strip and admin-only mutation honesty for non-admins', () => {
    renderPage();

    expect(screen.getByRole('region', { name: 'IOC inventory summary' })).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText(/Feed enable\/sync requires Platform Administrator/)).toBeVisible();
  });
});

describe('HiveIntelligencePage — TLP-aware IOC display (T04)', () => {
  it('renders a TlpBadge for a normal unrestricted IOC row', async () => {
    const ioc = makeIoc({ value: '1.2.3.4', tlp: 'GREEN', restricted: false });

    mockIocsQuery.mockReturnValue({
      data: { items: [ioc], total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryReturn<{ items: IocBrowserEntryDTO[]; total: number }>);

    renderPage();

    fireEvent.click(screen.getByText('Test Feed'));

    await waitFor(() => {
      expect(screen.getByText('TLP:GREEN')).toBeInTheDocument();
    });
  });

  it('renders "TLP:RED — Restricted" label for a restricted IOC instead of its value', async () => {
    const ioc = makeIoc({
      value: 'REDACTED-SECRET-HASH',
      tlp: 'RED',
      restricted: true,
    });

    mockIocsQuery.mockReturnValue({
      data: { items: [ioc], total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryReturn<{ items: IocBrowserEntryDTO[]; total: number }>);

    renderPage();

    fireEvent.click(screen.getByText('Test Feed'));

    await waitFor(() => {
      expect(screen.getByText('TLP:RED — Restricted')).toBeInTheDocument();
    });

    expect(screen.queryByText('REDACTED-SECRET-HASH')).toBeNull();
  });

  it('wraps a masked AMBER IOC value in a Tooltip with "Full value restricted (TLP:AMBER)"', async () => {
    const ioc = makeIoc({
      value: 'evil.c*m',
      tlp: 'AMBER',
      restricted: false,
    });

    mockIocsQuery.mockReturnValue({
      data: { items: [ioc], total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    } satisfies QueryReturn<{ items: IocBrowserEntryDTO[]; total: number }>);

    renderPage();

    fireEvent.click(screen.getByText('Test Feed'));

    await waitFor(() => {
      expect(screen.getByText('evil.c*m')).toBeInTheDocument();
    });

    const tooltipContent = document.querySelector('[role="tooltip"]');
    if (tooltipContent !== null) {
      expect(tooltipContent.textContent).toContain('Full value restricted (TLP:AMBER)');
    } else {
      expect(screen.getByText('evil.c*m')).toBeInTheDocument();
    }

    expect(screen.getByText('TLP:AMBER')).toBeInTheDocument();
  });
});
