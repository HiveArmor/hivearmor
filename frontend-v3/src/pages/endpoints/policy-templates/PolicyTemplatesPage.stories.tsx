/**
 * PolicyTemplatesPage.stories.tsx — PT-2 tabbed template editor + library.
 *
 * NOTE: this repo's Storybook has no msw-storybook-addon wired in `.storybook/
 * preview.tsx`, so `parameters.msw` handlers are a no-op. To render deterministic
 * states for the visual+a11y gate, we SEED the React Query cache directly with the
 * exact query key `usePolicyTemplates` uses (['policy-templates','list', params]
 * with the no-filter params object) and disable fetching, rather than relying on a
 * network mock that never intercepts.
 *
 * Variants:
 *   1. Default — two templates (ORG windows v2, GLOBAL linux v5); table + scope badges.
 *   2. Empty   — cache seeded with []; EmptyState prompt.
 *
 * Seeds an admin user so the read/mutate guards pass and GLOBAL scope is writable.
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { PolicyTemplatesPage } from './PolicyTemplatesPage';

import { useAuthStore, type HaUser } from '@/store/auth.store';
import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';


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

/** Exact key the page's default (no-filter) query uses — see usePolicyTemplates. */
const DEFAULT_QUERY_KEY = [
  'policy-templates',
  'list',
  { name: undefined, scope: undefined, platform: undefined },
] as const;

const SAMPLE_TEMPLATES: UtmAgentPolicyDTO[] = [
  {
    id: 1,
    policyName: 'Windows Server Baseline',
    description: 'FIM + change monitoring',
    platform: 'windows',
    versionNum: 2,
    isActive: true,
    createdAt: '2026-09-20T09:00:00Z',
    updatedAt: '2026-09-22T14:30:00Z',
    policyConfig: JSON.stringify({ schema_version: 1, fim: { mode: 'merge', rules: [] } }),
    // scope is an extra column the page's badge reads (not on the base DTO type)
    ...({ scope: 'ORG' } as object),
  },
  {
    id: 2,
    policyName: 'Global CIS L1',
    description: 'Cross-tenant CIS scan template',
    platform: 'linux',
    versionNum: 5,
    isActive: true,
    createdAt: '2026-09-18T08:00:00Z',
    updatedAt: '2026-09-21T16:45:00Z',
    policyConfig: JSON.stringify({
      schema_version: 1,
      fim: { mode: 'merge', rules: [] },
      scans: { cis: { enabled: true, mode: 'scheduled', cronOrInterval: '0 3 * * *', source: 'agent' } },
    }),
    ...({ scope: 'GLOBAL' } as object),
  },
];

function makeDecorator(
  user: HaUser,
  seed: UtmAgentPolicyDTO[],
): (Story: React.ComponentType) => React.ReactElement {
  function StoryDecorator(Story: React.ComponentType): React.ReactElement {
    React.useEffect(() => {
      useAuthStore.setState({ user, token: FAKE_TOKEN, isAuthenticated: true, isLoading: false });
    }, []);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnMount: false },
      },
    });
    // Seed the exact key so the page renders from cache without a network fetch.
    queryClient.setQueryData([...DEFAULT_QUERY_KEY], seed);
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return StoryDecorator;
}

const meta = {
  title: 'Pages/PolicyTemplatesPage',
  component: PolicyTemplatesPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'PT-2 tabbed policy template editor + library. Authors the full PT-0 schema ' +
          '(Generic/Monitor/Event/UEBA/User Log/FIM/Change/Script/Certificate/Osquery/Scans) ' +
          'via the PT-1 /templates endpoints. Sections the agent cannot yet enforce carry an ' +
          '“authored — not yet enforced” note; only FIM/collectors/telemetry/shell are enforced today.',
      },
    },
  },
} satisfies Meta<typeof PolicyTemplatesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'Default (templates loaded)',
  decorators: [makeDecorator(ADMIN_USER, SAMPLE_TEMPLATES)],
};

export const Empty: Story = {
  name: 'Empty (no templates)',
  decorators: [makeDecorator(ADMIN_USER, [])],
};
