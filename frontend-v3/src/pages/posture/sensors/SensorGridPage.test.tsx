import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SensorGridPage } from './SensorGridPage';

import {
  REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE,
  REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED,
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

describe('SensorGridPage remote actions (GAP-SEC-05)', () => {
  beforeEach(() => {
    useQuery.mockReturnValue({
      data: [
        {
          agentId: '42',
          hostname: 'wks-01',
          platform: 'windows',
          osVersion: '11',
          agentVersion: '1.0.0',
          connectionStatus: 'ACTIVE',
          lastSeen: '2026-08-23T00:00:00Z',
          cpuUsage: 10,
          memUsage: 20,
          diskUsage: null,
          collectorType: 'agent',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('keeps live-verify flag off by default', () => {
    expect(REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED).toBe(false);
  });

  it('shows honest blocked banner and disables isolate/kill while unverified', () => {
    render(<SensorGridPage />);

    expect(screen.getByText(REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Isolate host (blocked)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Kill process (blocked)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart agent (unavailable)' })).toBeDisabled();
  });
});
