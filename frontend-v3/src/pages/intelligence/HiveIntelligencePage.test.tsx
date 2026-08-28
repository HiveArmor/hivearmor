/**
 * HiveIntelligencePage.test.tsx — Prompt 13 + HI tab layout
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HiveIntelligencePage, INTELLIGENCE_JOB_SENTENCE } from './HiveIntelligencePage';

import type { IocBrowserEntryDTO, IocStatsDTO, ThreatFeedDTO, TlpLevel } from '@/types/threatIntel.types';

vi.mock('@/store/auth.store', () => {
  const fakeState = {
    user: { roles: ['ROLE_ANALYST'] },
    hasAnyRole: (_roles: string[]): boolean => true,
    hasRole: (_role: string): boolean => false,
  };
  return {
    useAuthStore: vi.fn((selector: (state: typeof fakeState) => unknown) => selector(fakeState)),
  };
});

vi.mock('@/services/threatIntel.service', () => ({
  threatIntelService: {
    listFeeds: vi.fn(),
    searchIocsPage: vi.fn(),
    toggleFeed: vi.fn(),
    syncFeed: vi.fn(),
    lookupIoc: vi.fn(),
    getIocStats: vi.fn(),
  },
}));

vi.mock('@/services/intelligenceFinding.service', () => ({
  intelligenceFindingService: {
    listFindings: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
  isUnconfiguredFinding: vi.fn().mockReturnValue(false),
}));

vi.mock('@/services/socAi.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/socAi.service')>(
    '@/services/socAi.service'
  );
  return { ...actual, socAiService: { query: vi.fn() } };
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
    if (key === 'intelligence-findings') {
      return { data: { items: [], total: 0 }, isLoading: false, isError: false, error: null };
    }
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
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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

describe('HiveIntelligencePage — tab workbench', () => {
  it('renders job sentence, staging badge, lookup tab, and cross-links', () => {
    renderPage();
    expect(screen.getByText(INTELLIGENCE_JOB_SENTENCE)).toBeVisible();
    expect(screen.getByText('STAGING CANDIDATE')).toBeVisible();
    expect(screen.getByRole('region', { name: 'IOC lookup' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Look up/i })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Mission Control' })).toHaveAttribute('href', '/dashboard');
  });

  it('renders tab labels including Ask Hive and Findings', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Look up' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Indicators' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Feeds' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Ask Hive' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Findings' })).toBeVisible();
  });

  it('shows feeds on Feeds tab', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Feeds' }));
    const feedsPanel = document.getElementById('ha-tabpanel-feeds');
    expect(feedsPanel).not.toBeNull();
    expect(within(feedsPanel as HTMLElement).getByRole('region', { name: 'Threat feeds' })).toBeVisible();
    expect(within(feedsPanel as HTMLElement).getByText('Test Feed')).toBeVisible();
  });

  it('shows Ask Hive panel on Ask Hive tab', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Ask Hive' }));
    expect(screen.getByRole('region', { name: 'Ask Hive' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Ask Hive/i })).toBeVisible();
  });

  it('shows feed picker on Indicators tab when no feed is selected', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }));
    expect(screen.getByText(/Select a feed to browse indicators/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /Test Feed/i })).toBeVisible();
  });
});

describe('HiveIntelligencePage — TLP-aware IOC display', () => {
  it('renders TlpBadge for unrestricted IOC on Indicators tab', async () => {
    mockIocsQuery.mockReturnValue({
      data: { items: [makeIoc()], total: 1 },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }));
    const indicatorsPanel = document.getElementById('ha-tabpanel-indicators');
    fireEvent.click(within(indicatorsPanel as HTMLElement).getByRole('button', { name: /Test Feed/i }));

    await waitFor(() => {
      expect(screen.getByText('TLP:GREEN')).toBeInTheDocument();
    });
  });
});
