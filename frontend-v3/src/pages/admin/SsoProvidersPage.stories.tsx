/**
 * SsoProvidersPage.stories.tsx
 *
 * Storybook CSF3 stories for the HiveArmor SSO Providers admin page (T03, Req 3.17).
 *
 * Three variants:
 *   1. Default — two providers seeded: Google Workspace (enabled=true) and
 *                Okta (enabled=false). Table rows, toggle switches, and action
 *                buttons are visible.
 *   2. Loading — MSW delays the /api/ha-oidc/providers response indefinitely;
 *                page shows skeleton rows.
 *   3. Empty   — MSW returns []; page shows "No SSO providers configured" with
 *                the inline Add Provider button.
 *
 * MSW v2 handlers intercept GET /api/ha-oidc/providers so each story reflects
 * realistic network behaviour without a running backend.
 *
 * The page guard requires ROLE_ADMIN. The auth store is seeded with an admin
 * user so the guard passes and the table is rendered in all three variants.
 *
 * Validates: Requirements 3.17
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { MemoryRouter } from 'react-router-dom';

import SsoProvidersPage from './SsoProvidersPage';

import { useAuthStore, type HaUser } from '@/store/auth.store';
import type { OidcProviderAdminDTO } from '@/types/sso';

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
// Sample SSO providers
// ---------------------------------------------------------------------------

const SAMPLE_PROVIDERS: OidcProviderAdminDTO[] = [
  {
    id: 1,
    providerName: 'Google Workspace',
    clientId: '123456789-abcdefgh.apps.googleusercontent.com',
    clientSecret: null,
    discoveryUrl:
      'https://accounts.google.com/.well-known/openid-configuration',
    scopes: 'openid profile email',
    enabled: true,
    createdAt: '2026-07-20T09:00:00Z',
    updatedAt: '2026-07-24T14:30:00Z',
  },
  {
    id: 2,
    providerName: 'Okta',
    clientId: '0oa3abcdefGHIJKLMN4x7',
    clientSecret: null,
    discoveryUrl:
      'https://dev-12345678.okta.com/.well-known/openid-configuration',
    scopes: 'openid profile email',
    enabled: false,
    createdAt: '2026-07-21T11:15:00Z',
    updatedAt: '2026-07-21T11:15:00Z',
  },
];

// ---------------------------------------------------------------------------
// MSW handler factories
// ---------------------------------------------------------------------------

/** Returns the two sample providers — default loaded state. */
const providersSuccessHandler = http.get('/api/ha-oidc/providers', () =>
  HttpResponse.json(SAMPLE_PROVIDERS),
);

/** Delays the response indefinitely — keeps the page in its skeleton/loading state. */
const providersLoadingHandler = http.get('/api/ha-oidc/providers', async () => {
  await delay('infinite');
  return HttpResponse.json(SAMPLE_PROVIDERS);
});

/** Returns an empty array — triggers the "No SSO providers configured" empty state. */
const providersEmptyHandler = http.get('/api/ha-oidc/providers', () =>
  HttpResponse.json([]),
);

// ---------------------------------------------------------------------------
// Story providers decorator factory
// ---------------------------------------------------------------------------

/**
 * Returns a Storybook decorator that wraps the story with:
 *   - Auth store seeded with an admin user (required by the page's access guard)
 *   - A fresh QueryClient (retry disabled for fast story rendering)
 *   - MemoryRouter so React Router hooks work inside the page
 */
function makeDecorator(user: HaUser): (Story: React.ComponentType) => React.ReactElement {
  function StoryDecorator(Story: React.ComponentType): React.ReactElement {
    React.useEffect(() => {
      useAuthStore.setState({
        user,
        token: FAKE_TOKEN,
        isAuthenticated: true,
        isLoading: false,
      });
    }, []);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });

    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/sso']}>
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

const meta = {
  title: 'Pages/SsoProvidersPage',
  component: SsoProvidersPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'HiveArmor SSO Providers admin page — configure OpenID Connect providers for ' +
          'single sign-on. Requires ROLE_ADMIN; non-admin users see an access-denied ' +
          'screen. Providers list in a sortable table with enabled toggles (optimistic ' +
          'UI), Client ID column, and Edit / Delete / Test Connection actions.',
      },
    },
  },
} satisfies Meta<typeof SsoProvidersPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Story 1 — Default
// Two providers: Google Workspace (enabled) and Okta (disabled).
// The table is fully populated with toggle switches and action buttons.
// ---------------------------------------------------------------------------

export const Default: Story = {
  name: 'Default (providers loaded)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [providersSuccessHandler],
    },
    docs: {
      description: {
        story:
          'Two sample providers: Google Workspace (enabled=true) and Okta (enabled=false). ' +
          'The Provider Name column is sortable. Discovery URLs are truncated with ellipsis ' +
          'and a tooltip reveals the full URL on hover. The Enabled column renders a ' +
          'PatternFly Switch with optimistic UI — toggling fires PUT /api/ha-oidc/providers/{id}. ' +
          'Edit and Delete actions open their respective modals.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 2 — Loading
// MSW delays the /api/ha-oidc/providers response indefinitely. The table
// renders three skeleton rows with the pulsing PatternFly Skeleton animation.
// ---------------------------------------------------------------------------

export const Loading: Story = {
  name: 'Loading (data pending)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [providersLoadingHandler],
    },
    docs: {
      description: {
        story:
          'MSW delays the providers fetch indefinitely. Three skeleton rows are displayed ' +
          'inside the table body using PatternFly Skeleton components at varying widths. ' +
          'The Add Provider button in the header remains visible and interactive.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 3 — Empty
// MSW returns an empty array. The table body shows "No SSO providers configured"
// with an inline Add Provider button as a call to action.
// ---------------------------------------------------------------------------

export const Empty: Story = {
  name: 'Empty (no providers)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [providersEmptyHandler],
    },
    docs: {
      description: {
        story:
          'The backend returns an empty provider list. The table body renders the empty ' +
          'state: "No SSO providers configured." text followed by an inline Add Provider ' +
          'secondary button as a call to action.',
      },
    },
  },
};
