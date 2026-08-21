/**
 * RuleImportPage.stories.tsx
 *
 * Storybook stories for the Rule Import admin page (T05, Req 5.15).
 *
 * Five variants:
 *   1. Default      — realistic Sigma rule list; ADMIN role; airGap=false
 *   2. Loading      — delayed MSW response; shows loading state
 *   3. Empty        — MSW returns []; shows zero-rules state
 *   4. Error        — MSW returns HTTP 500; shows error state
 *   5. AccessDenied — user has no ANALYST or ADMIN role
 *
 * MSW v2 handlers intercept GET /api/ha-sigma/rules (and GET /api/ha-config)
 * so each story reflects realistic network behaviour without a running backend.
 *
 * Validates: Requirements 5.15
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { MemoryRouter } from 'react-router-dom';

import RuleImportPage from './RuleImportPage';

import type { HaUser } from '@/store/auth.store';
import { useAuthStore } from '@/store/auth.store';
import type { SigmaRuleDTO } from '@/types/sigma';



// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ADMIN_USER: HaUser = {
  id: 1,
  login: 'admin',
  firstName: 'Alice',
  lastName: 'Admin',
  email: 'admin@hivearmor.local',
  roles: ['ROLE_ADMIN'],
  langKey: 'en',
};

const ANALYST_USER: HaUser = {
  id: 2,
  login: 'analyst',
  firstName: 'Bob',
  lastName: 'Analyst',
  email: 'analyst@hivearmor.local',
  roles: ['ROLE_ANALYST'],
  langKey: 'en',
};

const UNPRIVILEGED_USER: HaUser = {
  id: 3,
  login: 'viewer',
  firstName: 'Carol',
  lastName: 'Viewer',
  email: 'viewer@hivearmor.local',
  roles: ['ROLE_USER'],
  langKey: 'en',
};

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.token';

const SIGMA_RULES: SigmaRuleDTO[] = [
  {
    id: 1,
    sigmaId: 'aff56219-e3c8-4bbf-9a8d-abc123def001',
    ruleTitle: 'Mimikatz Command Line',
    ruleStatus: 'stable',
    logsourceProduct: 'windows',
    logsourceService: 'security',
    detectionYaml:
      'title: Mimikatz Command Line\nid: aff56219-e3c8-4bbf-9a8d-abc123def001\n' +
      'status: stable\nlogsource:\n  product: windows\n  service: security\n' +
      'detection:\n  selection:\n    CommandLine|contains:\n      - sekurlsa::logonpasswords\n' +
      '      - sekurlsa::wdigest\n  condition: selection\nlevel: critical\n',
    haSeverity: 5,
    mitreTags: 'attack.credential_access,attack.T1003.001',
    active: true,
    importedAt: '2026-07-25T03:00:00Z',
    updatedAt: '2026-07-25T03:00:00Z',
  },
  {
    id: 2,
    sigmaId: 'b7e34f61-2d9a-47c3-ba12-bcd456ef0022',
    ruleTitle: 'LSASS Memory Dump via ProcDump',
    ruleStatus: 'stable',
    logsourceProduct: 'windows',
    logsourceService: null,
    detectionYaml:
      'title: LSASS Memory Dump via ProcDump\nid: b7e34f61-2d9a-47c3-ba12-bcd456ef0022\n' +
      'status: stable\nlogsource:\n  product: windows\n  category: process_creation\n' +
      'detection:\n  selection:\n    Image|endswith: procdump.exe\n    CommandLine|contains: lsass\n' +
      '  condition: selection\nlevel: high\n',
    haSeverity: 4,
    mitreTags: 'attack.credential_access,attack.T1003.001',
    active: true,
    importedAt: '2026-07-25T03:00:00Z',
    updatedAt: '2026-07-25T03:00:00Z',
  },
  {
    id: 3,
    sigmaId: 'c9f12a84-5e6b-41d7-cb34-cde789fg0033',
    ruleTitle: 'Suspicious PowerShell Encoded Command',
    ruleStatus: 'stable',
    logsourceProduct: 'windows',
    logsourceService: 'powershell',
    detectionYaml:
      'title: Suspicious PowerShell Encoded Command\n' +
      'id: c9f12a84-5e6b-41d7-cb34-cde789fg0033\nstatus: stable\n' +
      'logsource:\n  product: windows\n  service: powershell\n' +
      'detection:\n  selection:\n    CommandLine|contains:\n      - -EncodedCommand\n      - -enc \n' +
      '  condition: selection\nlevel: medium\n',
    haSeverity: 3,
    mitreTags: 'attack.execution,attack.T1059.001',
    active: true,
    importedAt: '2026-07-24T03:00:00Z',
    updatedAt: '2026-07-24T03:00:00Z',
  },
  {
    id: 4,
    sigmaId: 'd0123b95-6f7c-42e8-dc45-def012gh0044',
    ruleTitle: 'Eventlog Clearing',
    ruleStatus: 'stable',
    logsourceProduct: 'windows',
    logsourceService: 'system',
    detectionYaml:
      'title: Eventlog Clearing\nid: d0123b95-6f7c-42e8-dc45-def012gh0044\n' +
      'status: stable\nlogsource:\n  product: windows\n  service: system\n' +
      'detection:\n  selection:\n    EventID: 104\n  condition: selection\nlevel: high\n',
    haSeverity: 4,
    mitreTags: 'attack.defense_evasion,attack.T1070.001',
    active: false,
    importedAt: '2026-07-23T03:00:00Z',
    updatedAt: '2026-07-23T03:00:00Z',
  },
  {
    id: 5,
    sigmaId: 'e1234c06-7g8d-53f9-ed56-efg345hi0055',
    ruleTitle: 'CloudTrail Disabled',
    ruleStatus: 'stable',
    logsourceProduct: 'aws',
    logsourceService: 'cloudtrail',
    detectionYaml:
      'title: CloudTrail Disabled\nid: e1234c06-7g8d-53f9-ed56-efg345hi0055\n' +
      'status: stable\nlogsource:\n  product: aws\n  service: cloudtrail\n' +
      'detection:\n  selection:\n    eventName: StopLogging\n  condition: selection\nlevel: high\n',
    haSeverity: 4,
    mitreTags: 'attack.defense_evasion,attack.T1562.008',
    active: true,
    importedAt: '2026-07-22T03:00:00Z',
    updatedAt: '2026-07-22T03:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// MSW handler factories
// ---------------------------------------------------------------------------

/** Intercepts GET /api/ha-sigma/rules with a realistic rule list. */
const rulesSuccessHandler = http.get('/api/ha-sigma/rules', () =>
  HttpResponse.json(SIGMA_RULES),
);

/** Intercepts GET /api/ha-sigma/rules with a long artificial delay. */
const rulesLoadingHandler = http.get('/api/ha-sigma/rules', async () => {
  await delay('infinite'); // keeps the request pending indefinitely in the story
  return HttpResponse.json([]);
});

/** Intercepts GET /api/ha-sigma/rules returning an empty array. */
const rulesEmptyHandler = http.get('/api/ha-sigma/rules', () =>
  HttpResponse.json([]),
);

/** Intercepts GET /api/ha-sigma/rules returning HTTP 500. */
const rulesErrorHandler = http.get('/api/ha-sigma/rules', () =>
  new HttpResponse(null, { status: 500 }),
);

/** Intercepts GET /api/ha-config and returns airGap=false. */
const configNormalHandler = http.get('/api/ha-config', () =>
  HttpResponse.json({ airGap: false }),
);

// ---------------------------------------------------------------------------
// Story providers decorator factory
// ---------------------------------------------------------------------------

/**
 * Returns a Storybook decorator that wraps stories with:
 *  - A fresh QueryClient (retry disabled for faster story rendering)
 *  - MemoryRouter so React Router hooks work inside the page
 *  - An auth-store initialisation side-effect via a thin provider shim
 */
function makeStoryDecorator(user: HaUser | null): (
  Story: () => React.ReactElement,
) => React.ReactElement {
  function StoryDecorator(Story: () => React.ReactElement): React.ReactElement {
    // Initialise or clear the Zustand auth store for this story.
    // We call setState directly on the store; Zustand stores are singletons
    // so this is safe in isolated Storybook canvases.
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
        <MemoryRouter initialEntries={['/admin/rules/import']}>
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

const meta: Meta<typeof RuleImportPage> = {
  title: 'Pages/Admin/RuleImportPage',
  component: RuleImportPage,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof RuleImportPage>;

// ---------------------------------------------------------------------------
// Story 1 — Default
// Realistic rule list returned from the API; ADMIN role; air-gap disabled.
// The AG Grid is populated, the Sync Now button is enabled.
// ---------------------------------------------------------------------------

export const Default: Story = {
  name: 'Default (ADMIN, rules loaded)',
  decorators: [makeStoryDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [configNormalHandler, rulesSuccessHandler],
    },
    docs: {
      description: {
        story:
          'Standard state: ADMIN user, air-gap disabled, five rules returned by the backend. ' +
          'The Sync Now button is visible and enabled. Clicking a row opens the YAML drawer.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 2 — Loading
// MSW delays the /api/ha-sigma/rules response indefinitely so the page stays
// in its loading skeleton state.
// ---------------------------------------------------------------------------

export const Loading: Story = {
  name: 'Loading (data pending)',
  decorators: [makeStoryDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [configNormalHandler, rulesLoadingHandler],
    },
    docs: {
      description: {
        story:
          'MSW delays the rules fetch indefinitely so the AG Grid loading state is ' +
          'visible. The Sync Now button is rendered (ADMIN role, no pending mutation).',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 3 — Empty
// MSW returns an empty array; the grid shows the AG Grid "no rows" overlay.
// ---------------------------------------------------------------------------

export const Empty: Story = {
  name: 'Empty (zero rules)',
  decorators: [makeStoryDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [configNormalHandler, rulesEmptyHandler],
    },
    docs: {
      description: {
        story:
          'The backend returns an empty array. The status card shows 0 total rules and ' +
          'the AG Grid renders its "No Rows To Show" overlay.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 4 — Error
// MSW returns HTTP 500; the error state banner is shown instead of the grid.
// ---------------------------------------------------------------------------

export const Error: Story = {
  name: 'Error (HTTP 500)',
  decorators: [makeStoryDecorator(ANALYST_USER)],
  parameters: {
    msw: {
      handlers: [configNormalHandler, rulesErrorHandler],
    },
    docs: {
      description: {
        story:
          'The rules endpoint returns HTTP 500. SigmaImportTab renders its inline error ' +
          'banner with an AlertTriangle icon. The grid is not shown.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 5 — AccessDenied
// User has only ROLE_USER — no ANALYST or ADMIN. The AuthGuard renders the
// AccessDeniedPage in-place rather than the page content.
// ---------------------------------------------------------------------------

export const AccessDenied: Story = {
  name: 'AccessDenied (ROLE_USER only)',
  decorators: [makeStoryDecorator(UNPRIVILEGED_USER)],
  parameters: {
    msw: {
      handlers: [configNormalHandler, rulesSuccessHandler],
    },
    docs: {
      description: {
        story:
          'The authenticated user holds only ROLE_USER. AuthGuard renders ' +
          'AccessDeniedPage in-place; the rule grid and tabs are not shown. ' +
          'In this story the component renders directly (no router-level redirect) ' +
          'so the access-denied UI from SigmaImportTab is visible.',
      },
    },
  },
};
