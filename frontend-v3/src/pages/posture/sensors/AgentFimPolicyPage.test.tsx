/**
 * AgentFimPolicyPage — STAGING CANDIDATE honesty + role gates + dual-plane link.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentFimPolicyPage } from './AgentFimPolicyPage';

const mockUseUtmAgentPolicies = vi.fn();
const mockUseAgentGroups = vi.fn();
const mockAuthRoles = vi.fn<() => string[]>(() => ['ROLE_ADMIN']);

vi.mock('@/hooks/useAgentPoliciesPush', () => ({
  useUtmAgentPolicies: (...args: unknown[]) => mockUseUtmAgentPolicies(...args),
  useAgentGroups: (...args: unknown[]) => mockUseAgentGroups(...args),
  usePolicyPushLog: () => ({ data: [], isLoading: false, isError: false }),
  usePolicyStates: () => ({ data: [], isLoading: false, isError: false }),
  useCreateUtmAgentPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateUtmAgentPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteUtmAgentPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignPolicyGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnassignPolicyGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePushPolicyToGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePushPolicyToAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/services/sensorsService', () => ({
  fetchSensors: vi.fn(async () => ({
    sensors: [
      {
        agentId: '42',
        hostname: 'host-a',
        platform: 'linux',
        osVersion: null,
        agentVersion: '1.0.0',
        connectionStatus: 'ONLINE' as const,
        lastSeen: null,
        cpuUsage: null,
        memUsage: null,
        diskUsage: null,
        collectorType: null,
        mode: null,
        bundleVersion: null,
      },
    ],
    total: 1,
  })),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (
    selector: (s: { user: { roles: string[] } | null }) => unknown,
  ) =>
    selector({
      user: { roles: mockAuthRoles() },
    }),
}));

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgentFimPolicyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AgentFimPolicyPage', () => {
  beforeEach(() => {
    mockAuthRoles.mockReturnValue(['ROLE_ADMIN']);
    mockUseAgentGroups.mockReturnValue({
      data: [{ id: 10, groupName: 'Linux fleet', memberCount: 3 }],
      isLoading: false,
      isError: false,
    });
    mockUseUtmAgentPolicies.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('denies read without Analyst / SOC Manager / Admin', () => {
    mockAuthRoles.mockReturnValue(['ROLE_USER']);
    renderPage();
    expect(screen.getByText('Access denied')).toBeVisible();
    expect(
      screen.getByText(/Required permission: Platform Administrator, SOC Manager, or Analyst/),
    ).toBeVisible();
    expect(mockUseUtmAgentPolicies).not.toHaveBeenCalled();
  });

  it('shows STAGING CANDIDATE banner and dual-plane note', () => {
    renderPage();
    expect(
      screen.getByText(/Agent FIM policy push — STAGING CANDIDATE/),
    ).toBeVisible();
    expect(screen.getByText(/Ha Agent Policies/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ha policies (legacy)' })).toHaveAttribute(
      'href',
      '/edr/policies',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Related views' })).getByRole('link', {
        name: 'Sensors',
      }),
    ).toHaveAttribute('href', '/posture/sensors');
  });

  it('read-only for Analyst (no create)', () => {
    mockAuthRoles.mockReturnValue(['ROLE_ANALYST']);
    renderPage();
    expect(screen.getByText(/Read-only/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create policy' })).not.toBeInTheDocument();
  });

  it('lists policies for Admin', () => {
    mockUseUtmAgentPolicies.mockReturnValue({
      data: [
        {
          id: 1,
          policyName: 'Linux defaults',
          platform: 'linux',
          versionNum: 2,
          assignedGroupIds: [10],
          updatedAt: '2026-09-01T12:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText('Linux defaults')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create policy' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Assign / Push' })).toBeVisible();
  });

  it('SOC Manager can open Assign / Push with group picker (no manual-only hack)', async () => {
    const user = userEvent.setup();
    mockAuthRoles.mockReturnValue(['ROLE_SOC_MANAGER']);
    mockUseUtmAgentPolicies.mockReturnValue({
      data: [
        {
          id: 1,
          policyName: 'SOC policy',
          platform: 'linux',
          versionNum: 1,
          assignedGroupIds: [],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Assign / Push' }));
    expect(screen.getByLabelText('Agent group')).toBeVisible();
    expect(screen.getByRole('option', { name: /Linux fleet/ })).toBeInTheDocument();
    expect(screen.getByText(/push-on-connect/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Push to agent' })).toBeVisible();
    expect(await screen.findByLabelText('Sensor')).toBeVisible();
  });

  it('shows telemetry schedule fields in create modal', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Create policy' }));
    expect(screen.getByLabelText(/SCA interval/)).toBeVisible();
    expect(screen.getByLabelText(/SBOM interval/)).toBeVisible();
    expect(screen.getByText('Telemetry schedule (schema v1.1)')).toBeVisible();
  });
});
