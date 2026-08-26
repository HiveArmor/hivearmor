import { render, screen } from '@testing-library/react';
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
vi.mock('@/lib/auth/hasAuthority', () => ({
  hasAuthority: (role: string) => role === 'ROLE_ADMIN',
}));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector?: (state: {
    hasAnyRole: (roles: string[]) => boolean;
    hasRole: (role: string) => boolean;
  }) => unknown) => {
    const state = {
      hasAnyRole: (roles: string[]) => roles.includes('ROLE_ADMIN'),
      hasRole: (role: string) => role === 'ROLE_ADMIN',
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
    rowData: Array<{ hostname: string; agentId: string }>;
    columnDefs: Array<{ headerName?: string; cellRenderer?: (p: unknown) => JSX.Element }>;
  }) => {
    const actionsCol = columnDefs.find((c) => c.headerName === 'Actions');
    const row = rowData[0];
    return (
      <div role="grid" aria-label="Sensors">
        {row && actionsCol?.cellRenderer
          ? actionsCol.cellRenderer({ data: row })
          : null}
      </div>
    );
  },
}));

describe('SensorGridPage remote actions (GAP-SEC-05 / B1)', () => {
  beforeEach(() => {
    useQuery.mockReturnValue({
      data: [
        {
          agentId: '42',
          hostname: 'wks-01',
          platform: 'windows',
          osVersion: '11',
          agentVersion: '1.0.0',
          connectionStatus: 'ONLINE',
          lastSeen: '2026-08-23T00:00:00Z',
          cpuUsage: null,
          memUsage: null,
          diskUsage: null,
          collectorType: 'agent',
          mode: null,
          bundleVersion: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('keeps kill live-verify on after staging ProcessCommand proof', () => {
    expect(REMOTE_SENSOR_KILL_LIVE_VERIFIED).toBe(true);
  });

  it('enables kill for Admin; isolate stays blocked until separately verified', () => {
    render(
      <MemoryRouter>
        <SensorGridPage />
      </MemoryRouter>
    );

    expect(screen.getByText(REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Isolate host (blocked)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Kill process' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart agent (unavailable)' })).toBeDisabled();
    expect(screen.getAllByRole('link', { name: 'Enrollment audit' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Add Agent/i })).toBeVisible();
    expect(screen.getByLabelText('How to enroll an agent')).toBeVisible();
  });
});
