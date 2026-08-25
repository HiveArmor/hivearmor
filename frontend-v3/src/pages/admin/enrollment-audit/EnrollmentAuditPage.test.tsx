/**
 * EnrollmentAuditPage — access gate + list wiring honesty.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EnrollmentAuditPage } from './EnrollmentAuditPage';

const mockList = vi.fn();
const mockExport = vi.fn();
const mockHasAnyRole = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { enabled?: boolean; queryFn: () => Promise<unknown> }) => {
    if (opts.enabled === false) {
      return { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false };
    }
    return {
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    };
  },
}));

vi.mock('@/services/enrollmentAudit.service', () => ({
  listEnrollmentAudit: (...args: unknown[]) => mockList(...args),
  downloadEnrollmentAuditExport: (...args: unknown[]) => mockExport(...args),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { hasAnyRole: typeof mockHasAnyRole }) => unknown) =>
    selector({ hasAnyRole: mockHasAnyRole }),
}));

vi.mock('@/hooks/useRowDensity', () => ({
  useRowDensity: () => ['compact', vi.fn()],
  ROW_HEIGHTS: { compact: 32, standard: 40, comfortable: 48 },
}));

vi.mock('@/components/siem-data-grid/SiemDataGrid', () => ({
  SiemDataGrid: () => <div data-testid="enrollment-audit-grid" />,
}));

describe('EnrollmentAuditPage', () => {
  beforeEach(() => {
    mockHasAnyRole.mockReset();
    mockList.mockReset();
    mockExport.mockReset();
  });

  it('denies Analyst without Platform Administrator or SOC Manager', () => {
    mockHasAnyRole.mockReturnValue(false);
    render(<EnrollmentAuditPage />);
    expect(screen.getByText(/Enrollment audit restricted/i)).toBeVisible();
    expect(screen.getByText(/Platform Administrator or SOC Manager/i)).toBeVisible();
  });

  it('renders ledger chrome for authorized roles', () => {
    mockHasAnyRole.mockReturnValue(true);
    render(<EnrollmentAuditPage />);
    expect(screen.getByText('Enrollment Audit')).toBeVisible();
    expect(screen.getByText(/GET \/api\/ha-agent-enrollments\/audit/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Export NDJSON/i })).toBeVisible();
  });
});
