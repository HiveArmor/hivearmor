/**
 * AgentPoliciesPage tests — Validates: Requirements 5.x
 *
 * Tests:
 *   1) Access denied state — when user does NOT have ROLE_ADMIN, renders the
 *      access-denied UI with role="alert" / aria-label="Access denied" and
 *      does NOT invoke any data hooks
 *   2) Loading state      — when user has ROLE_ADMIN and isLoading=true,
 *      renders skeleton rows (role="presentation") in the table body
 *   3) Empty state        — when user has ROLE_ADMIN and the policy list is
 *      empty, renders a PatternFly EmptyState with the "No agent policies"
 *      body text
 *   4) Error state        — when user has ROLE_ADMIN and isError=true,
 *      renders a PatternFly Alert with variant="danger" containing the
 *      error message
 *
 * Mocked dependencies:
 *   - @/store/auth.store          — controls hasRole to gate the access-denied path
 *   - @/lib/roles                 — provides ROLES.ADMIN constant
 *   - @/hooks/useAgentPolicies    — controls data / loading / error states
 *   - @/hooks/useHaThemeTokens    — resolveHaToken returns stable string so
 *                                   getComputedStyle is never called in jsdom
 *   - @/components/ha-modal/HaModal
 *   - @/components/ha-drawer/HaDrawer
 *   - @/components/ha-button/HaButton
 *   - @/components/ha-confirmation-modal/HaConfirmationModal
 *
 * Product name: HiveArmor
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AgentPoliciesPage } from './AgentPoliciesPage';

import type { AgentPolicyDTO } from '@/types/edr';

// ---------------------------------------------------------------------------
// Mock @/lib/roles — return stable ROLES constant
// ---------------------------------------------------------------------------

vi.mock('@/lib/roles', () => ({
  ROLES: {
    ADMIN: 'ROLE_ADMIN',
    SOC_MANAGER: 'ROLE_SOC_MANAGER',
    ANALYST: 'ROLE_ANALYST',
    USER: 'ROLE_USER',
  },
}));

// ---------------------------------------------------------------------------
// Mock @/store/auth.store — controls hasRole return value per test
// ---------------------------------------------------------------------------

const mockHasRole = vi.fn();

vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({
    hasRole: mockHasRole,
  }),
}));

// ---------------------------------------------------------------------------
// Mock data hooks
//
// useAgentPolicies drives loading / error / data states.
// The four mutation hooks (create, update, delete, assign) are always idle
// so they don't interfere with state assertions.
// ---------------------------------------------------------------------------

type MutationStub = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
};

const mockUseAgentPolicies = vi.fn();

vi.mock('@/hooks/useAgentPolicies', () => ({
  useAgentPolicies: (...args: unknown[]) => mockUseAgentPolicies(...args),
  useCreateAgentPolicy: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAgentPolicy: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgentPolicy: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
  useAssignAgents: (): MutationStub => ({ mutate: vi.fn(), isPending: false }),
}));

// ---------------------------------------------------------------------------
// Mock @/hooks/useHaThemeTokens — avoids getComputedStyle calls in jsdom
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useHaThemeTokens', () => ({
  resolveHaToken: () => '#000000',
}));

// ---------------------------------------------------------------------------
// Mock heavy / environment-sensitive components
// ---------------------------------------------------------------------------

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
  }: {
    isOpen: boolean;
    children?: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return <div role="complementary">{children}</div>;
  },
}));

vi.mock('@/components/ha-button/HaButton', () => ({
  HaButton: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock('@/components/ha-confirmation-modal/HaConfirmationModal', () => ({
  HaConfirmationModal: ({ isOpen }: { isOpen: boolean }) => {
    if (!isOpen) return null;
    return <div role="dialog" aria-label="confirm-delete-modal" />;
  },
}));

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<AgentPoliciesPage />);
}

// ---------------------------------------------------------------------------
// Default mock values applied before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: admin user; tests that need non-admin override this
  (mockHasRole as ReturnType<typeof vi.fn>).mockImplementation((role: string) => role === 'ROLE_ADMIN');

  // Default: idle data state; overridden per test
  mockUseAgentPolicies.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentPoliciesPage', () => {
  // 1. Access denied state — ROLE_ADMIN absent
  it('renders access-denied state and does not invoke data hooks when user lacks ROLE_ADMIN', () => {
    // Make hasRole return false for any role — no ROLE_ADMIN
    (mockHasRole as ReturnType<typeof vi.fn>).mockReturnValue(false);

    renderPage();

    // The access-denied container has role="alert" and aria-label="Access denied"
    const accessDenied = screen.getByRole('alert', { name: /access denied/i });
    expect(accessDenied).toBeDefined();

    // The heading inside the guard reads "Access Restricted"
    expect(screen.getByText(/access restricted/i)).toBeDefined();

    // The body text mentions ROLE_ADMIN
    expect(screen.getByText(/ROLE_ADMIN/)).toBeDefined();

    // useAgentPolicies must NOT have been called — hooks are skipped for non-admin
    expect(mockUseAgentPolicies).not.toHaveBeenCalled();
  });

  // 2. Loading state — skeleton rows
  it('renders skeleton rows when user has ROLE_ADMIN and isLoading is true', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderPage();

    // The page renders a table with aria-label="Agent policies"
    const table = screen.getByRole('table', { name: /agent policies/i });
    expect(table).toBeDefined();

    // SkeletonRow renders <tr role="presentation"> — five are rendered during loading
    const skeletonRows = screen.getAllByRole('presentation');
    expect(skeletonRows.length).toBeGreaterThanOrEqual(5);

    // No error alert should be present
    expect(screen.queryByRole('heading', { name: /failed to load agent policies/i })).toBeNull();

    // No empty-state text
    expect(screen.queryByText(/no agent policies configured yet/i)).toBeNull();
  });

  // 3. Empty state — PatternFly EmptyState
  it('renders a PatternFly EmptyState when user has ROLE_ADMIN and no policies exist', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: [] as AgentPolicyDTO[],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderPage();

    // The empty-state body text rendered inside <EmptyStateBody>
    expect(screen.getByText(/no agent policies configured yet/i)).toBeDefined();

    // The body text also mentions HiveArmor (product name constraint)
    expect(screen.getByText(/HiveArmor monitoring policy/i)).toBeDefined();

    // No error alert
    expect(screen.queryByRole('heading', { name: /failed to load agent policies/i })).toBeNull();

    // No skeleton rows — loading is false
    expect(screen.queryByRole('presentation')).toBeNull();
  });

  // 4. Error state — PatternFly Alert with danger variant
  it('renders a PatternFly Alert with danger variant when user has ROLE_ADMIN and isError is true', () => {
    mockUseAgentPolicies.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Cannot reach agent policy service'),
    });

    renderPage();

    // PatternFly v6 Alert with variant="danger" renders an h4 heading whose
    // accessible name contains the alert title text (matches existing test pattern)
    const alertHeading = screen.getByRole('heading', {
      name: /failed to load agent policies/i,
    });
    expect(alertHeading).toBeDefined();

    // The error message body text should also be visible
    expect(screen.getByText(/cannot reach agent policy service/i)).toBeDefined();

    // No skeleton rows
    expect(screen.queryByRole('presentation')).toBeNull();

    // No empty-state text
    expect(screen.queryByText(/no agent policies configured yet/i)).toBeNull();
  });
});
