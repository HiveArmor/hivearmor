/**
 * HostAssociationsPage.stories.tsx — PT-3 ranked host→template associations.
 *
 * As with the PT-2 story, this repo's Storybook has no msw addon wired, so we SEED the
 * React Query cache directly with the exact keys the page reads:
 *   - HOST_ASSOCIATIONS_KEY (['host-template-associations']) — the association tables
 *   - the usePolicyTemplates default no-filter key — the template checkboxes
 * and disable fetching, rather than relying on a network mock that never intercepts.
 *
 * Variants:
 *   1. Default — one ORG table with a rank-1 group row + rank-2 any catch-all.
 *   2. Empty   — no tables; EmptyState prompt.
 *
 * Seeds an admin user so the read/mutate guards pass.
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { HostAssociationsPage } from './HostAssociationsPage';

import { useAuthStore, type HaUser } from '@/store/auth.store';
import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';
import type { HostTemplateAssociationDTO } from '@/types/hostTemplateAssociations';

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

const HOST_ASSOCIATIONS_KEY = ['host-template-associations'] as const;

/** Exact key usePolicyTemplates uses for the no-filter list (template checkboxes). */
const TEMPLATES_KEY = [
  'policy-templates',
  'list',
  { name: undefined, scope: undefined, platform: undefined },
] as const;

const SAMPLE_TEMPLATES: UtmAgentPolicyDTO[] = [
  { id: 1, policyName: 'sec-log-full', platform: 'windows', versionNum: 2, isActive: true, policyConfig: '{}' },
  { id: 2, policyName: 'compliance-scan', platform: 'linux', versionNum: 1, isActive: true, policyConfig: '{}' },
  { id: 3, policyName: 'sec-log-basic', platform: 'windows', versionNum: 3, isActive: true, policyConfig: '{}' },
];

const SAMPLE_TABLES: HostTemplateAssociationDTO[] = [
  {
    id: 1,
    name: 'Default binding',
    scope: 'ORG',
    versionNum: 3,
    lastAppliedAt: '2026-09-23T10:00:00Z',
    rowsJson: JSON.stringify({
      scope: 'ORG',
      rows: [
        { rank: 1, name: 'Critical servers', match: { group: 'Critical_Servers' }, templates: ['sec-log-full', 'compliance-scan'] },
        { rank: 2, name: 'UEBA workstations', match: { group: 'UEBA_Workstations' }, templates: ['sec-log-basic'] },
        { rank: 3, name: 'All other hosts', match: { any: true }, templates: ['sec-log-basic'] },
      ],
    }),
  },
];

function makeDecorator(
  tables: HostTemplateAssociationDTO[],
): (Story: React.ComponentType) => React.ReactElement {
  function StoryDecorator(Story: React.ComponentType): React.ReactElement {
    React.useEffect(() => {
      useAuthStore.setState({ user: ADMIN_USER, token: FAKE_TOKEN, isAuthenticated: true, isLoading: false });
    }, []);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnMount: false },
      },
    });
    queryClient.setQueryData([...HOST_ASSOCIATIONS_KEY], tables);
    queryClient.setQueryData([...TEMPLATES_KEY], SAMPLE_TEMPLATES);
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
  title: 'Pages/HostAssociationsPage',
  component: HostAssociationsPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'PT-3 ranked host→template associations. A host’s effective policy is the templates on ' +
          'the highest-ranked matching row (first match wins). Editing is a draft; Apply re-resolves ' +
          'affected hosts and re-pushes APPLY_POLICY. Includes a per-host effective-policy preview.',
      },
    },
  },
} satisfies Meta<typeof HostAssociationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'Default (one ranked table)',
  decorators: [makeDecorator(SAMPLE_TABLES)],
};

export const Empty: Story = {
  name: 'Empty (no tables)',
  decorators: [makeDecorator([])],
};
