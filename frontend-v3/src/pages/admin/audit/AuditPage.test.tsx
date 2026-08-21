/**
 * AuditPage tests — honest 500 from GET /api/ha-audit-log
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditPage } from './AuditPage';

import { ApiError } from '@/lib/apiClient';
import { useAuthStore } from '@/store/auth.store';

const getMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    apiClient: { get: getMock },
  };
});

function renderAudit(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuditPage />
    </QueryClientProvider>,
  );
}

describe('AuditPage', () => {
  beforeEach(() => {
    getMock.mockReset();
    useAuthStore.setState({
      user: {
        id: 1,
        login: 'admin',
        firstName: 'Platform',
        lastName: 'Admin',
        email: 'admin@example.test',
        roles: ['ROLE_ADMIN'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: 1,
    });
  });

  it('shows an honest unavailable state when the audit API returns HTTP 500', async () => {
    getMock.mockRejectedValue(new ApiError(500, { status: 500, title: 'Internal Server Error' }, 'HTTP 500'));
    renderAudit();
    expect(await screen.findByText('Audit log is unavailable')).toBeVisible();
    expect(screen.getByText(/GET \/api\/ha-audit-log returned HTTP 500/)).toBeVisible();
    expect(screen.getByText(/GET \/api\/ha-audit-log\/export does not exist/)).toBeVisible();
  });
});
