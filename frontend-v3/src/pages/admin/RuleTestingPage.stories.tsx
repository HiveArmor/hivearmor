/**
 * RuleTestingPage.stories.tsx — Storybook CSF3 stories for the Rule Testing Sandbox.
 *
 * Storybook note: RuleTestingPage loads Monaco Editor lazily and calls real API endpoints.
 * In Storybook the API calls will fail gracefully — the page still renders for visual review.
 *
 * For full interactive testing use the running dev server.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import RuleTestingPage from '@/pages/admin/RuleTestingPage';
import { useAuthStore, type HaUser } from '@/store/auth.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANALYST_USER: HaUser = {
  id: 1,
  login: 'analyst',
  firstName: 'Ana',
  lastName: 'Lyst',
  email: 'analyst@hivearmor.local',
  roles: ['ROLE_ANALYST'],
  langKey: 'en',
};

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function WithProviders({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/admin/rules/test']}>
        <div style={{ minHeight: '100vh', background: 'var(--ha-background)', color: 'var(--ha-text-primary)', fontFamily: 'Inter, sans-serif' }}>
          {children}
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Storybook meta (must be the default export at the top level)
// ---------------------------------------------------------------------------

const meta = {
  title: 'HiveArmor/Pages/RuleTestingPage',
  component: RuleTestingPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story: React.ComponentType) => (
      <WithProviders>
        <Story />
      </WithProviders>
    ),
  ],
} satisfies Meta<typeof RuleTestingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  beforeEach() {
    useAuthStore.setState({
      user: ANALYST_USER,
      token: 'story-token',
      isAuthenticated: true,
      isLoading: false,
    });
  },
};
