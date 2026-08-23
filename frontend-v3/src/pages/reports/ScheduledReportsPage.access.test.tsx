/**
 * ScheduledReportsPage access — Platform Administrator is Analyst-or-higher
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledReportsPage } from './ScheduledReportsPage';

import { useAuthStore } from '@/store/auth.store';
import type { HaUser } from '@/store/auth.store';

const fetchScheduledReports = vi.hoisted(() => vi.fn());

vi.mock('./reports.service', () => ({
  fetchReportsByType: vi.fn().mockResolvedValue([]),
  fetchScheduledReports,
  deleteScheduledReport: vi.fn(),
  pauseScheduledReport: vi.fn(),
  resumeScheduledReport: vi.fn(),
  runScheduledReport: vi.fn(),
}));

function userWithRoles(roles: string[]): HaUser {
  return {
    id: 1,
    login: 'admin',
    firstName: 'Platform',
    lastName: 'Admin',
    email: 'admin@example.test',
    roles,
    langKey: 'en',
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ScheduledReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ScheduledReportsPage access', () => {
  beforeEach(() => {
    fetchScheduledReports.mockReset();
    fetchScheduledReports.mockResolvedValue([]);
  });

  it('lets a Platform Administrator view the scheduled reports list', async () => {
    useAuthStore.setState({
      user: userWithRoles(['ROLE_ADMIN']),
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: 1,
    });
    renderPage();
    expect(await screen.findByText('No scheduled reports')).toBeVisible();
    expect(screen.queryByText('Reporting access restricted')).toBeNull();
  });

  it('keeps users without Analyst-or-higher on the restricted empty state', async () => {
    useAuthStore.setState({
      user: userWithRoles(['ROLE_USER']),
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: 1,
    });
    renderPage();
    expect(await screen.findByText('Reporting access restricted')).toBeVisible();
    expect(fetchScheduledReports).not.toHaveBeenCalled();
  });
});
