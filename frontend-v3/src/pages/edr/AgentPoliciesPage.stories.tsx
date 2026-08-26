/**
 * AgentPoliciesPage.stories.tsx
 *
 * Storybook CSF3 stories for the HiveArmor Agent Policies page (T05, Req 5.10).
 *
 * Three variants:
 *   1. Default — three policies: one Windows (3 agents), one Linux (0 agents),
 *                one macOS (1 agent). Table, badges, and action buttons visible.
 *   2. Loading — MSW delays the /api/ha-edr/policies response indefinitely;
 *                page shows skeleton rows.
 *   3. Empty   — MSW returns empty array; page shows the EmptyState.
 *
 * The page uses ROLE_ADMIN for its access guard. The auth store is seeded with
 * an admin user so the guard passes and the table is rendered.
 *
 * The page does NOT use useParams, so no MemoryRouter is required — a plain
 * QueryClientProvider wrapper is sufficient.
 *
 * Validates: Requirements 5.10
 */

import React from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { MemoryRouter } from 'react-router-dom';

import { AgentPoliciesPage } from './AgentPoliciesPage';

import { useAuthStore, type HaUser } from '@/store/auth.store';
import type { AgentPolicyDTO } from '@/types/edr';

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
// Sample policies
// ---------------------------------------------------------------------------

const SAMPLE_POLICIES: AgentPolicyDTO[] = [
  {
    id: 1,
    name: 'Windows Workstation Hardening',
    osType: 'windows',
    filePaths: ['C:\\Windows\\System32', 'C:\\Program Files'],
    registryPaths: [
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services',
    ],
    networkMonitor: true,
    processMonitor: true,
    assignedAgentIds: [
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '550e8400-e29b-41d4-a716-446655440003',
    ],
    createdAt: '2026-07-20T09:00:00Z',
    updatedAt: '2026-07-24T14:30:00Z',
  },
  {
    id: 2,
    name: 'Linux Server Baseline',
    osType: 'linux',
    filePaths: ['/etc/passwd', '/etc/shadow', '/etc/sudoers'],
    registryPaths: [],
    networkMonitor: true,
    processMonitor: false,
    assignedAgentIds: [],
    createdAt: '2026-07-21T11:15:00Z',
    updatedAt: '2026-07-21T11:15:00Z',
  },
  {
    id: 3,
    name: 'macOS Developer Station',
    osType: 'macos',
    filePaths: ['/etc/hosts', '/Library/LaunchDaemons'],
    registryPaths: [],
    networkMonitor: false,
    processMonitor: true,
    assignedAgentIds: ['6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    createdAt: '2026-07-22T08:00:00Z',
    updatedAt: '2026-07-23T16:45:00Z',
  },
];

// ---------------------------------------------------------------------------
// MSW handler factories
// ---------------------------------------------------------------------------

/** Returns the three sample policies — default loaded state. */
const policiesSuccessHandler = http.get('/api/ha-edr/policies', () =>
  HttpResponse.json(SAMPLE_POLICIES),
);

/** Delays the response indefinitely — keeps the page in its skeleton/loading state. */
const policiesLoadingHandler = http.get('/api/ha-edr/policies', async () => {
  await delay('infinite');
  return HttpResponse.json(SAMPLE_POLICIES);
});

/** Returns an empty array — triggers the EmptyState. */
const policiesEmptyHandler = http.get('/api/ha-edr/policies', () =>
  HttpResponse.json([]),
);

// ---------------------------------------------------------------------------
// Story providers decorator factory
// ---------------------------------------------------------------------------

/**
 * Returns a Storybook decorator that wraps the story with:
 *   - Auth store seeded with the given user (must have ROLE_ADMIN for the
 *     page's access guard to pass)
 *   - A fresh QueryClient (retry disabled for fast story rendering)
 *   - No MemoryRouter — AgentPoliciesPage does not use useParams
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
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return StoryDecorator;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'HiveArmor/Pages/AgentPoliciesPage',
  component: AgentPoliciesPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'HiveArmor Agent Policy Management page — create, edit, assign, and delete ' +
          'endpoint monitoring policies. Requires ROLE_ADMIN; non-admin users see an ' +
          'access-denied screen. Policies list in a sortable HTML table with OS badges, ' +
          'assigned-agent counts, and inline Edit / Assign / Delete actions.',
      },
    },
  },
} satisfies Meta<typeof AgentPoliciesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Story 1 — Default
// Three policies covering all three OS types.
// Windows policy: 3 assigned agents  |  Linux policy: 0 agents  |  macOS: 1 agent
// ---------------------------------------------------------------------------

export const Default: Story = {
  name: 'Default (policies loaded)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [policiesSuccessHandler],
    },
    docs: {
      description: {
        story:
          'Three sample policies: a Windows Workstation Hardening policy with 3 assigned ' +
          'agents, a Linux Server Baseline with 0 agents, and a macOS Developer Station ' +
          'with 1 agent. OS Type badges use resolved HiveArmor design tokens ' +
          '(--ha-medium for Windows, --ha-positive for Linux, --ha-primary for macOS). ' +
          'The policy count badge in the header reads "3 policies".',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 2 — Loading
// MSW delays the /api/ha-edr/policies response indefinitely. The table renders
// five skeleton rows with the pulsing animation.
// ---------------------------------------------------------------------------

export const Loading: Story = {
  name: 'Loading (data pending)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [policiesLoadingHandler],
    },
    docs: {
      description: {
        story:
          'MSW delays the policies fetch indefinitely. Five skeleton rows are displayed ' +
          'inside the table with the ha-policies-pulse animation. The Spinner in the ' +
          'header is visible and the policy count badge is hidden while loading.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Story 3 — Empty
// MSW returns an empty array. The page renders the PatternFly EmptyState with
// the ClipboardList icon and "No agent policies configured yet" message.
// ---------------------------------------------------------------------------

export const Empty: Story = {
  name: 'Empty (no policies)',
  decorators: [makeDecorator(ADMIN_USER)],
  parameters: {
    msw: {
      handlers: [policiesEmptyHandler],
    },
    docs: {
      description: {
        story:
          'The backend returns an empty policy list. The page renders the PatternFly ' +
          'EmptyState with the ClipboardList icon and the message prompting the user to ' +
          'click "Create Policy" to define the first HiveArmor monitoring policy.',
      },
    },
  },
};
