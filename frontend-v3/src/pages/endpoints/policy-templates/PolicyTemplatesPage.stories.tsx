/**
 * PolicyTemplatesPage.stories.tsx — PT-2 tabbed template editor + library.
 *
 * Variants:
 *   1. Default — two templates (ORG windows v2, GLOBAL linux v5); table + scope badges.
 *   2. Loading — MSW delays /api/agent-policies/templates; header spinner.
 *   3. Empty   — MSW returns []; EmptyState prompt.
 *
 * Seeds an admin user so the read/mutate guards pass and GLOBAL scope is writable.
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';

import { PolicyTemplatesPage } from './PolicyTemplatesPage';

import { useAuthStore, type HaUser } from '@/store/auth.store';


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

const SAMPLE_TEMPLATES = [
  {
    id: 1,
    policyName: 'Windows Server Baseline',
    description: 'FIM + change monitoring',
    platform: 'windows',
    scope: 'ORG',
    versionNum: 2,
    isActive: true,
    createdAt: '2026-09-20T09:00:00Z',
    updatedAt: '2026-09-22T14:30:00Z',
    policyConfig: JSON.stringify({ schema_version: 1, fim: { mode: 'merge', rules: [] } }),
  },
  {
    id: 2,
    policyName: 'Global CIS L1',
    description: 'Cross-tenant CIS scan template',
    platform: 'linux',
    scope: 'GLOBAL',
    versionNum: 5,
    isActive: true,
    createdAt: '2026-09-18T08:00:00Z',
    updatedAt: '2026-09-21T16:45:00Z',
    policyConfig: JSON.stringify({
      schema_version: 1,
      fim: { mode: 'merge', rules: [] },
      scans: { cis: { enabled: true, mode: 'scheduled', cronOrInterval: '0 3 * * *', source: 'agent' } },
    }),
  },
];

const successHandler = http.get('/api/agent-policies/templates', () =>
  HttpResponse.json(SAMPLE_TEMPLATES),
);
const loadingHandler = http.get('/api/agent-policies/templates', async () => {
  await delay('infinite');
  return HttpResponse.json(SAMPLE_TEMPLATES);
});
const emptyHandler = http.get('/api/agent-policies/templates', () => HttpResponse.json([]));

function makeDecorator(user: HaUser): (Story: React.ComponentType) => React.ReactElement {
  function StoryDecorator(Story: React.ComponentType): React.ReactElement {
    React.useEffect(() => {
      useAuthStore.setState({ user, token: FAKE_TOKEN, isAuthenticated: true, isLoading: false });
    }, []);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    });
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
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: { msw: { handlers: [successHandler] } },
};

export const Loading: Story = {
  name: 'Loading (data pending)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: { msw: { handlers: [loadingHandler] } },
};

export const Empty: Story = {
  name: 'Empty (no templates)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: { msw: { handlers: [emptyHandler] } },
};
