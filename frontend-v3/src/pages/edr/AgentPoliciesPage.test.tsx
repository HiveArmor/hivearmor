/**
 * AgentPoliciesPage tests — POL-001 / POL-003 honesty + role gates + UX density
 *
 * Tests:
 *   1) Access denied — no read role; hooks skipped; human permission copy
 *   2) Loading state — Analyst/Admin read + skeleton rows
 *   3) Empty state — PatternFly EmptyState + Sensors/Endpoints links
 *   4) Error state — PatternFly Alert
 *   5) Honesty banner + job sentence — STAGING CANDIDATE / never enforced on host
 *   6) Cross-links to Sensors and Endpoints
 *   7) Analyst read-only — no Create Policy; Evidence action present
 *   8) Enforcement drawer — apply/ack unavailable when state lacks appliedVersion
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentPoliciesPage } from './AgentPoliciesPage';

import type { AgentPolicyDTO } from '@/types/edr';

vi.mock('@/lib/roles', () => ({
  ROLES: {
    ADMIN: 'ROLE_ADMIN',
    SOC_MANAGER: 'ROLE_SOC_MANAGER',
    ANALYST: 'ROLE_ANALYST',
    USER: 'ROLE_USER',
  },
}));

const mockHasAnyRole = vi.fn();
let mockRoles: string[] = ['ROLE_ADMIN'];

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector?: (state: {
    hasAnyRole: (roles: string[]) => boolean;
    user: { roles: string[] } | null;
  }) => unknown) => {
    const state = {
      hasAnyRole: mockHasAnyRole,
      user: { roles: mockRoles },
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

const mockUseAgentPolicies = vi.fn();
const mockUseEnforcement = vi.fn();

vi.mock('@/hooks/useAgentPolicies', () => ({
  useAgentPolicies: (...args: unknown[]) => mockUseAgentPolicies(...args),
  useAgentPolicyEnforcementEvidence: (...args: unknown[]) => mockUseEnforcement(...args),
  useCreateAgentPolicy: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAgentPolicy: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgentPolicy: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
  useAssignAgents: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ha-modal/HaModal', () => ({
  HaModal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children?: React.ReactNode;
    title?: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={title ?? 'modal'}>
        {children}
      </div>
    );
  },
}));

vi.mock('@/components/ha-drawer/HaDrawer', () => ({
  HaDrawer: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children?: React.ReactNode;
    title?: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={title ?? 'drawer'}>
        {children}
      </div>
    );
  },
}));

vi.mock('@/components/ha-button/HaButton', () => ({
  HaButton: ({
    children,
    onClick,
    isDisabled,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={isDisabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ha-confirmation-modal/HaConfirmationModal', () => ({
  HaConfirmationModal: () => null,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentPoliciesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRoles = ['ROLE_ADMIN'];
  mockHasAnyRole.mockImplementation((roles: string[]) =>
    roles.some((r) => mockRoles.includes(r)),
  );

  mockUseAgentPolicies.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  });

  mockUseEnforcement.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('AgentPoliciesPage', () => {
  it('renders access-denied with human role labels and does not invoke data hooks', () => {
    mockRoles = [];
    mockHasAnyRole.mockReturnValue(false);

    renderPage();

    expect(screen.getByRole('alert', { name: /access denied/i })).toBeDefined();
    expect(screen.getByText(/access restricted/i)).toBeDefined();
    expect(screen.getByText(/Platform Administrator, SOC Manager, or Analyst/i)).toBeDefined();
    expect(screen.queryByText(/ROLE_ADMIN/)).toBeNull();
    expect(mockUseAgentPolicies).not.toHaveBeenCalled();
  });

  it('renders skeleton rows when loading', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByRole('table', { name: /agent policies/i })).toBeDefined();
    expect(screen.getAllByRole('presentation').length).toBeGreaterThanOrEqual(5);
  });

  it('renders empty state with Sensors and Endpoints links', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: [] as AgentPolicyDTO[],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText(/no agent policies configured yet/i)).toBeDefined();
    expect(screen.getByText(/HiveArmor monitoring policy/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /^Sensors$/i })).toHaveAttribute(
      'href',
      '/posture/sensors',
    );
    expect(screen.getByRole('link', { name: /^Endpoints$/i })).toHaveAttribute(
      'href',
      '/edr/endpoints',
    );
  });

  it('renders danger alert on load error', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Cannot reach agent policy service'),
    });

    renderPage();

    expect(
      screen.getByRole('heading', { name: /failed to load agent policies/i }),
    ).toBeDefined();
    expect(screen.getByText(/cannot reach agent policy service/i)).toBeDefined();
  });

  it('shows job sentence, honesty banner, and never claims host enforcement', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: [] as AgentPolicyDTO[],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(
      screen.getByText(/policies assign configuration — not verified host enforcement/i),
    ).toBeDefined();
    expect(screen.getByText(/STAGING CANDIDATE/i)).toBeDefined();
    expect(screen.getByText(/apply\/ack path unavailable/i)).toBeDefined();
    expect(screen.getByText(/never treat .* enforced on host/i)).toBeDefined();
    expect(
      screen.getByText(/Define and assign agent monitoring policies \(config only\)/i),
    ).toBeDefined();
    expect(screen.queryByText(/enforced on host$/i)).toBeNull();
  });

  it('cross-links to Sensors fleet and Endpoints timelines', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: [] as AgentPolicyDTO[],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(
      screen.getByRole('link', { name: /Sensors — fleet \/ enroll/i }),
    ).toHaveAttribute('href', '/posture/sensors');
    expect(
      screen.getByRole('link', { name: /Endpoints — timelines/i }),
    ).toHaveAttribute('href', '/edr/endpoints');
  });

  it('allows Analyst read-only without Create Policy', () => {
    mockRoles = ['ROLE_ANALYST'];
    mockUseAgentPolicies.mockReturnValue({
      data: [
        {
          id: 1,
          name: 'Windows FIM baseline',
          osType: 'windows',
          assignedAgentIds: ['agent-1'],
        },
      ] as AgentPolicyDTO[],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText(/Windows FIM baseline/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /create policy/i })).toBeNull();
    expect(screen.getByText(/Read-only/i)).toBeDefined();
    expect(screen.getByText(/Platform Administrator or SOC Manager/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /view enforcement evidence/i })).toBeDefined();
    expect(
      screen.getByRole('link', { name: /View 1 assigned hosts on Endpoints/i }),
    ).toHaveAttribute('href', '/edr/endpoints');
  });

  it('surfaces apply/ack path unavailable when state lacks appliedVersion', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    mockRoles = ['ROLE_ANALYST'];
    mockUseAgentPolicies.mockReturnValue({
      data: [
        {
          id: 9,
          name: 'Linux process monitor',
          osType: 'linux',
          assignedAgentIds: ['agent-9'],
        },
      ] as AgentPolicyDTO[],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseEnforcement.mockReturnValue({
      data: {
        policyId: 9,
        assignedAgentIds: ['agent-9'],
        evidenceAvailability: 'unavailable',
        honestyNote:
          'AgentPolicyState rows exist but lack appliedVersion/lastAppliedAt ack fields. Apply/ack path unavailable — never treat as enforced on host.',
        applyAckPathAvailable: false,
        agentStates: [
          {
            agentId: 'agent-9',
            desiredVersion: 2,
            state: 'PENDING',
            lastCheckedAt: '2026-08-25T05:00:00Z',
            driftDetails: 'awaiting apply',
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();
    await user.click(screen.getByRole('button', { name: /view enforcement evidence/i }));

    expect(screen.getByRole('status', { name: /apply ack path status/i })).toBeDefined();
    expect(screen.getByText(/^Apply\/ack path unavailable$/i)).toBeDefined();
    expect(screen.getByText(/never treat as enforced on host/i)).toBeDefined();
    expect(screen.getByText(/awaiting apply/i)).toBeDefined();
    expect(
      screen.getByRole('link', { name: /Open Endpoints for host context/i }),
    ).toHaveAttribute('href', '/edr/endpoints');
  });
});
