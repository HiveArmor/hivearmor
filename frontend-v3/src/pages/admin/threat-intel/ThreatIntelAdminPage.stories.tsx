/**
 * ThreatIntelAdminPage.stories.tsx
 *
 * Storybook CSF3 stories for the HiveArmor Threat Intelligence admin page
 * (T05, Req 5.12).
 *
 * Three variants:
 *   1. Default      — populated TAXII and MISP feeds with realistic IOC stats.
 *   2. WithFeeds    — additional feeds showing multi-row tables and varied
 *                     sync statuses (OK / ERROR / null).
 *   3. EmptyState   — no feeds configured on either tab; empty-row messages
 *                     visible in both tables.
 *
 * MSW v2 handlers intercept the three API endpoints used by this page so each
 * story reflects realistic network behaviour without a running backend:
 *   GET /api/ha-threat-intel/stats
 *   GET /api/ha-threat-intel/taxii-feeds
 *   GET /api/ha-threat-intel/misp-feeds
 *
 * The page guard requires ROLE_ADMIN. The auth store is seeded with an admin
 * user in all three stories so the guard passes and tables are rendered.
 *
 * Validates: Requirements 5.12
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { MemoryRouter } from 'react-router-dom';

import { ThreatIntelAdminPage } from './ThreatIntelAdminPage';

import type { HaUser } from '@/store/auth.store';
import { useAuthStore } from '@/store/auth.store';
import type { IocStatsDTO, MispFeedDTO, TaxiiFeedDTO } from '@/types/threatIntel.types';

// ---------------------------------------------------------------------------
// Fixture data — admin user
// ---------------------------------------------------------------------------

const ADMIN_USER: HaUser = {
  id: 1,
  login: 'admin',
  firstName: 'Ada',
  lastName: 'Admin',
  email: 'admin@hivearmor.local',
  roles: ['ROLE_ADMIN'],
  langKey: 'en',
};

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.story.token';

// ---------------------------------------------------------------------------
// Fixture data — IOC stats
// ---------------------------------------------------------------------------

const SAMPLE_STATS: IocStatsDTO = {
  totalActive: 1247,
  byType: {
    ip: 623,
    domain: 401,
    hash: 189,
    url: 22,
    email: 12,
  },
  expiredToday: 8,
};

const EMPTY_STATS: IocStatsDTO = {
  totalActive: 0,
  byType: { ip: 0, domain: 0, hash: 0, url: 0, email: 0 },
  expiredToday: 0,
};

// ---------------------------------------------------------------------------
// Fixture data — TAXII feeds
// ---------------------------------------------------------------------------

const TAXII_FEEDS_DEFAULT: TaxiiFeedDTO[] = [
  {
    id: 1,
    name: 'MITRE ATT&CK',
    taxiiUrl: 'https://cti-taxii.mitre.org/taxii/',
    collectionId: 'enterprise-attack',
    enabled: true,
    lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    lastSyncStatus: 'OK',
    lastSyncCount: 234,
    createdAt: '2026-07-20T00:00:00Z',
  },
];

const TAXII_FEEDS_MULTIPLE: TaxiiFeedDTO[] = [
  {
    id: 1,
    name: 'MITRE ATT&CK',
    taxiiUrl: 'https://cti-taxii.mitre.org/taxii/',
    collectionId: 'enterprise-attack',
    enabled: true,
    lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastSyncStatus: 'OK',
    lastSyncCount: 234,
    createdAt: '2026-07-20T00:00:00Z',
  },
  {
    id: 2,
    name: 'Abuse.ch URLhaus',
    taxiiUrl: 'https://urlhaus-api.abuse.ch/taxii2/',
    collectionId: 'urlhaus-collection',
    enabled: true,
    lastSyncAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30m ago
    lastSyncStatus: 'OK',
    lastSyncCount: 1832,
    createdAt: '2026-07-21T00:00:00Z',
  },
  {
    id: 3,
    name: 'Custom Internal Feed',
    taxiiUrl: 'https://ti.corp.example/taxii/',
    collectionId: 'internal-indicators',
    enabled: false,
    lastSyncAt: null,
    lastSyncStatus: 'ERROR',
    lastSyncCount: 0,
    createdAt: '2026-07-22T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Fixture data — MISP feeds
// ---------------------------------------------------------------------------

const MISP_FEEDS_DEFAULT: MispFeedDTO[] = [
  {
    id: 1,
    name: 'Internal MISP',
    mispUrl: 'https://misp.corp.example',
    enabled: true,
    filterTags: 'tlp:green',
    lastSyncAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4h ago
    lastSyncStatus: 'OK',
    lastSyncCount: 312,
  },
];

const MISP_FEEDS_MULTIPLE: MispFeedDTO[] = [
  {
    id: 1,
    name: 'Internal MISP',
    mispUrl: 'https://misp.corp.example',
    enabled: true,
    filterTags: 'tlp:green',
    lastSyncAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    lastSyncStatus: 'OK',
    lastSyncCount: 312,
  },
  {
    id: 2,
    name: 'CIRCL MISP',
    mispUrl: 'https://www.circl.lu/misp',
    enabled: true,
    filterTags: null,
    lastSyncAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12h ago
    lastSyncStatus: 'OK',
    lastSyncCount: 5412,
  },
  {
    id: 3,
    name: 'Legacy Threat Share',
    mispUrl: 'https://old-misp.example.com',
    enabled: false,
    filterTags: 'apt',
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncCount: 0,
  },
];

// ---------------------------------------------------------------------------
// MSW handler factories
// ---------------------------------------------------------------------------

const statsSuccessHandler = http.get('/api/ha-threat-intel/stats', () =>
  HttpResponse.json(SAMPLE_STATS),
);

const statsEmptyHandler = http.get('/api/ha-threat-intel/stats', () =>
  HttpResponse.json(EMPTY_STATS),
);

const statsLoadingHandler = http.get('/api/ha-threat-intel/stats', async () => {
  await delay('infinite');
  return HttpResponse.json(SAMPLE_STATS);
});

const taxiiFeedsDefaultHandler = http.get('/api/ha-threat-intel/taxii-feeds', () =>
  HttpResponse.json(TAXII_FEEDS_DEFAULT),
);

const taxiiFeedsMultipleHandler = http.get('/api/ha-threat-intel/taxii-feeds', () =>
  HttpResponse.json(TAXII_FEEDS_MULTIPLE),
);

const taxiiFeedsEmptyHandler = http.get('/api/ha-threat-intel/taxii-feeds', () =>
  HttpResponse.json([]),
);

const mispFeedsDefaultHandler = http.get('/api/ha-threat-intel/misp-feeds', () =>
  HttpResponse.json(MISP_FEEDS_DEFAULT),
);

const mispFeedsMultipleHandler = http.get('/api/ha-threat-intel/misp-feeds', () =>
  HttpResponse.json(MISP_FEEDS_MULTIPLE),
);

const mispFeedsEmptyHandler = http.get('/api/ha-threat-intel/misp-feeds', () =>
  HttpResponse.json([]),
);

// ---------------------------------------------------------------------------
// Story providers decorator factory
// ---------------------------------------------------------------------------

/**
 * Returns a Storybook decorator that wraps the story with:
 *   - Auth store seeded with an admin user (satisfies the page's ROLE_ADMIN guard)
 *   - A fresh QueryClient (retry disabled for fast story rendering)
 *   - MemoryRouter so React Router hooks work inside the page
 */
function makeDecorator(
  user: HaUser | null,
): (Story: React.ComponentType) => React.ReactElement {
  function StoryDecorator(Story: React.ComponentType): React.ReactElement {
    React.useEffect(() => {
      if (user) {
        useAuthStore.setState({
          user,
          token: FAKE_TOKEN,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        useAuthStore.setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    }, []);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });

    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/threat-intel']}>
          <Story />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return StoryDecorator;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof ThreatIntelAdminPage> = {
  title: 'HiveArmor/Pages/Admin/ThreatIntelAdminPage',
  component: ThreatIntelAdminPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'HiveArmor Threat Intelligence admin page — manage TAXII 2.1 and MISP feed ' +
          'sources, monitor IOC ingestion pipelines, and view aggregate IOC health ' +
          'statistics. Requires ROLE_ADMIN; non-admin users see an access-denied screen.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ThreatIntelAdminPage>;

// ---------------------------------------------------------------------------
// Story 1 — Default
// One TAXII feed (OK), one MISP feed, and populated stats tiles.
// Demonstrates the standard operational view for a platform administrator.
// ---------------------------------------------------------------------------

export const Default: Story = {
  name: 'Default (feeds loaded)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [
        statsSuccessHandler,
        taxiiFeedsDefaultHandler,
        mispFeedsDefaultHandler,
      ],
    },
    docs: {
      description: {
        story:
          'Standard view: ADMIN user, one TAXII feed (MITRE ATT&CK, enabled, last sync OK), ' +
          'one MISP feed (Internal MISP, enabled). The IOC stats panel shows five KPI tiles: ' +
          'Total Active IOCs (1 247), IPs (623), Domains (401), Hashes (189), and Expired ' +
          'Today (8). The TAXII Feeds tab is active by default. Clicking "MISP Feeds" switches ' +
          'to the MISP table. "Add TAXII Feed" and "Add MISP Feed" buttons open side drawers.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 2 — WithFeeds
// Multiple TAXII and MISP feeds, including disabled feeds and error statuses.
// Demonstrates the fully-populated admin view with varied states per row.
// ---------------------------------------------------------------------------

export const WithFeeds: Story = {
  name: 'WithFeeds (populated tables)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [
        statsSuccessHandler,
        taxiiFeedsMultipleHandler,
        mispFeedsMultipleHandler,
      ],
    },
    docs: {
      description: {
        story:
          'Three TAXII feeds and three MISP feeds. Each table shows: a mix of enabled ' +
          '(switch on) and disabled (switch off) feeds, varying IOC counts, and three ' +
          'distinct sync statuses — OK (green label), ERROR (red label), and never-synced ' +
          '(dash). The third TAXII row ("Custom Internal Feed") and third MISP row ' +
          '("Legacy Threat Share") are disabled with no recorded sync.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 3 — EmptyState
// Both tabs return empty arrays; IOC stats are all zero.
// Demonstrates the zero-data onboarding view.
// ---------------------------------------------------------------------------

export const EmptyState: Story = {
  name: 'EmptyState (no feeds configured)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [
        statsEmptyHandler,
        taxiiFeedsEmptyHandler,
        mispFeedsEmptyHandler,
      ],
    },
    docs: {
      description: {
        story:
          'No feeds are configured. The IOC stats panel shows zeros across all five tiles. ' +
          'The TAXII Feeds table renders the empty-row message: ' +
          '"No TAXII feeds configured. Click \\"Add TAXII Feed\\" to get started." ' +
          'Switching to the MISP Feeds tab shows the equivalent MISP empty message. ' +
          'The "Add TAXII Feed" and "Add MISP Feed" buttons remain visible as the primary ' +
          'call to action.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 4 — Loading
// MSW delays the stats response indefinitely so skeleton tiles remain visible.
// ---------------------------------------------------------------------------

const taxiiFeedsLoadingHandler = http.get('/api/ha-threat-intel/taxii-feeds', async () => {
  await delay('infinite');
  return HttpResponse.json(TAXII_FEEDS_DEFAULT);
});

const mispFeedsLoadingHandler = http.get('/api/ha-threat-intel/misp-feeds', async () => {
  await delay('infinite');
  return HttpResponse.json(MISP_FEEDS_DEFAULT);
});

export const Loading: Story = {
  name: 'Loading (data pending)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [statsLoadingHandler, taxiiFeedsLoadingHandler, mispFeedsLoadingHandler],
    },
    docs: {
      description: {
        story:
          'MSW delays all three API responses indefinitely. The IOC stats panel shows ' +
          'PatternFly Skeleton blocks and both feed tables render their loading state.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 5 — Error
// MSW returns HTTP 500 for the feeds endpoints so error banners are visible.
// ---------------------------------------------------------------------------

const statsErrorHandler = http.get('/api/ha-threat-intel/stats', () =>
  new HttpResponse(null, { status: 500 }),
);

const taxiiFeedsErrorHandler = http.get('/api/ha-threat-intel/taxii-feeds', () =>
  new HttpResponse(null, { status: 500 }),
);

const mispFeedsErrorHandler = http.get('/api/ha-threat-intel/misp-feeds', () =>
  new HttpResponse(null, { status: 500 }),
);

export const Error: Story = {
  name: 'Error (server failure)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [statsErrorHandler, taxiiFeedsErrorHandler, mispFeedsErrorHandler],
    },
    docs: {
      description: {
        story:
          'All three endpoints return HTTP 500. The page renders PatternFly danger Alert ' +
          'banners for each failed query so the operator can diagnose the issue.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 6 — AccessDenied
// Non-admin user — the page guard renders the access-denied EmptyState.
// ---------------------------------------------------------------------------

const NON_ADMIN_USER: HaUser = {
  id: 2,
  login: 'analyst',
  firstName: 'Ana',
  lastName: 'Analyst',
  email: 'analyst@hivearmor.local',
  roles: ['ROLE_ANALYST'],
  langKey: 'en',
};

export const AccessDenied: Story = {
  name: 'AccessDenied (non-admin)',
  decorators: [makeDecorator(NON_ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [statsSuccessHandler, taxiiFeedsDefaultHandler, mispFeedsDefaultHandler],
    },
    docs: {
      description: {
        story:
          'The current user only has ROLE_ANALYST. The page guard catches the missing ' +
          'ROLE_ADMIN and renders the "Administrator access required." EmptyState ' +
          'with a lock icon instead of the feed tables.',
      },
    },
  },
};
