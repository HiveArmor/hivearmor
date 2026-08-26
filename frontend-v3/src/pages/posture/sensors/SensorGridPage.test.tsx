import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SensorGridPage } from './SensorGridPage';

import {
  REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE,
  REMOTE_SENSOR_KILL_LIVE_VERIFIED,
} from '@/services/sensorRemoteActions.capabilities';

vi.mock('@/hooks/useEpsStream', () => ({
  useEpsStream: () => ({ connected: true, eps: 100 }),
}));
vi.mock('@/components/status-dock', () => ({
  StatusDock: () => <div data-testid="status-dock" />,
}));
vi.mock('@/components/density-selector', () => ({
  DensitySelector: () => null,
}));
vi.mock('./AddAgentDrawer', () => ({
  AddAgentDrawer: () => null,
}));
vi.mock('./AgentPackageCatalog', () => ({
  AgentPackageCatalog: () => null,
}));

const hasAuthority = vi.fn((role: string) => role === 'ROLE_ADMIN');
vi.mock('@/lib/auth/hasAuthority', () => ({
  hasAuthority: (role: string) => hasAuthority(role),
}));

const authRoles = vi.fn(() => ['ROLE_ADMIN'] as string[]);
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector?: (state: {
    hasAnyRole: (roles: string[]) => boolean;
    hasRole: (role: string) => boolean;
  }) => unknown) => {
    const roles = authRoles();
    const state = {
      hasAnyRole: (wanted: string[]) => wanted.some((r) => roles.includes(r)),
      hasRole: (role: string) => roles.includes(role),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

const useQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

vi.mock('@/components/siem-data-grid', () => ({
  SiemDataGrid: ({
    rowData,
    columnDefs,
  }: {
    rowData: Array<{ hostname: string; agentId: string; connectionStatus?: string }>;
    columnDefs: Array<{
      field?: string;
      headerName?: string;
      cellRenderer?: (p: unknown) => JSX.Element;
    }>;
  }) => {
    const actionsCol = columnDefs.find((c) => c.headerName === 'Actions');
    const hostnameCol = columnDefs.find((c) => c.field === 'hostname');
    return (
      <div role="grid" aria-label="Registered agents">
        {rowData.map((row) => (
          <div key={row.agentId}>
            {hostnameCol?.cellRenderer
              ? hostnameCol.cellRenderer({ data: row, value: row.hostname })
              : null}
            {actionsCol?.cellRenderer ? actionsCol.cellRenderer({ data: row }) : null}
          </div>
        ))}
      </div>
    );
  },
}));

const ONLINE_ROW = {
  agentId: '42',
  hostname: 'wks-01',
  platform: 'windows',
  osVersion: '11',
  agentVersion: '1.0.0',
  connectionStatus: 'ONLINE' as const,
  lastSeen: '2026-08-23T00:00:00Z',
  cpuUsage: null,
  memUsage: null,
  diskUsage: null,
  collectorType: 'agent',
  mode: null,
  bundleVersion: null,
};

const OFFLINE_ROW = {
  ...ONLINE_ROW,
  agentId: '43',
  hostname: 'wks-02',
  connectionStatus: 'OFFLINE' as const,
};

describe('SensorGridPage fleet UX', () => {
  beforeEach(() => {
    hasAuthority.mockImplementation((role: string) => role === 'ROLE_ADMIN');
    authRoles.mockReturnValue(['ROLE_ADMIN']);
    useQuery.mockImplementation((opts: { queryKey?: unknown[] }) => {
      const key = Array.isArray(opts.queryKey) ? String(opts.queryKey[0]) : '';
      if (key === 'ha-agent-packages-summary') {
        return {
          data: {
            latestVersion: '1.0.0',
            updaterVersion: '1.0.0',
            publishedCount: 1,
            totalCount: 6,
            packages: [],
          },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: [ONLINE_ROW, OFFLINE_ROW],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      };
    });
  });

  it('keeps kill live-verify on after staging ProcessCommand proof', () => {
    expect(REMOTE_SENSOR_KILL_LIVE_VERIFIED).toBe(true);
  });

  it('enables kill for Admin; isolate stays blocked; omits dead Restart affordance', () => {
    render(
      <MemoryRouter>
        <SensorGridPage />
      </MemoryRouter>
    );

    expect(screen.getByText(REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE)).toBeTruthy();
    expect(screen.getByText(/Kill process remains available/i)).toBeTruthy();
    expect(screen.queryByText(/INTERNAL_KEY|ProcessCommand|\/api\/edr/i)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Isolate host (blocked)' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Kill process' })[0]).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: /Restart agent/i })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Enrollment audit' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Add Agent/i })).toBeVisible();
    expect(screen.getByText(/Install agents/i)).toBeVisible();
    expect(screen.getByRole('grid', { name: 'Registered agents' })).toBeVisible();
  });

  it('exposes fleet page job, endpoint telemetry hub, and row timeline links', () => {
    render(
      <MemoryRouter>
        <SensorGridPage />
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Agent fleet inventory — health, timelines, and enrollment/i)
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Endpoint telemetry' })).toHaveAttribute(
      'href',
      '/edr/endpoints'
    );
    const timelineLinks = screen.getAllByRole('link', {
      name: /Open EDR timeline for wks-01/i,
    });
    expect(timelineLinks.length).toBeGreaterThanOrEqual(2);
    expect(timelineLinks[0]).toHaveAttribute('href', '/edr/timeline/42');
  });

  it('filters inventory by online/offline like SIEM fleet consoles', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SensorGridPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /All \(2\)/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Online \(1\)/i }));
    expect(
      screen.getAllByRole('link', { name: /Open EDR timeline for wks-01/i }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Open EDR timeline for wks-02/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Offline \(1\)/i }));
    expect(
      screen.getAllByRole('link', { name: /Open EDR timeline for wks-02/i }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Open EDR timeline for wks-01/i })).toBeNull();
  });

  it('fail-closes Add Agent for Analyst while keeping inventory readable', () => {
    hasAuthority.mockReturnValue(false);
    authRoles.mockReturnValue(['ROLE_ANALYST']);

    render(
      <MemoryRouter>
        <SensorGridPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /Add Agent/i })).toBeNull();
    expect(
      screen.getByText(/Required permission: Platform Administrator to enroll agents/i)
    ).toBeVisible();
    expect(screen.getByRole('grid', { name: 'Registered agents' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Endpoint telemetry' })).toBeVisible();
  });
});
