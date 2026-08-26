/**
 * EndpointsListPage tests — host workbench empty/error + Sensors cross-link
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EndpointsListPage } from './EndpointsListPage';

const fetchSensors = vi.hoisted(() => vi.fn());

vi.mock('@/services/sensorsService', () => ({
  fetchSensors,
}));

vi.mock('@/components/density-selector', () => ({
  DensitySelector: () => null,
}));

vi.mock('@/components/siem-data-grid', () => ({
  SiemDataGrid: ({
    rowData,
    columnDefs,
  }: {
    rowData: Array<{ hostname: string; agentId: string }>;
    columnDefs: Array<{
      field?: string;
      headerName?: string;
      cellRenderer?: (p: unknown) => JSX.Element;
    }>;
  }) => {
    const actionsCol = columnDefs.find((c) => c.headerName === 'Actions');
    const hostnameCol = columnDefs.find((c) => c.field === 'hostname');
    return (
      <div role="grid" aria-label="Registered endpoints">
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

const SAMPLE_ROW = {
  agentId: '19',
  hostname: 'EC2AMAZ-8F0Q7DL',
  platform: 'windows',
  osVersion: '10',
  agentVersion: '11.0.0',
  connectionStatus: 'ONLINE' as const,
  lastSeen: '2026-08-26T00:00:00Z',
  cpuUsage: null,
  memUsage: null,
  diskUsage: null,
  collectorType: 'agent',
  mode: null,
  bundleVersion: null,
};

describe('EndpointsListPage', () => {
  beforeEach(() => {
    fetchSensors.mockReset();
  });

  it('states Endpoints job vs Sensors and links to fleet enroll', async () => {
    fetchSensors.mockResolvedValue({ sensors: [], total: 0 });
    render(
      <MemoryRouter>
        <EndpointsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No endpoints registered')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Endpoints' })).toBeVisible();
    expect(
      screen.getByText(
        /Open host timelines and endpoint defense views\. Use Sensors for fleet enrollment/i,
      ),
    ).toBeVisible();
    expect(screen.getByText('Endpoints is the host timeline workbench')).toBeVisible();

    const sensorsLinks = screen.getAllByRole('link', { name: /Sensors/i });
    expect(sensorsLinks.length).toBeGreaterThan(0);
    expect(sensorsLinks.every((link) => link.getAttribute('href') === '/posture/sensors')).toBe(
      true,
    );
  });

  it('renders an error state when the agent list cannot be loaded', async () => {
    fetchSensors.mockRejectedValue(new Error('GET /api/agent-manager/agents: 500'));
    render(
      <MemoryRouter>
        <EndpointsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Endpoint inventory is unavailable')).toBeVisible();
    expect(screen.getByText(/agent-manager\/agents: 500/)).toBeVisible();
  });

  it('opens timeline paths consistent with Sensors for registered hosts', async () => {
    fetchSensors.mockResolvedValue({ sensors: [SAMPLE_ROW], total: 1 });
    render(
      <MemoryRouter>
        <EndpointsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('grid', { name: 'Registered endpoints' })).toBeVisible();

    const timelineLinks = screen.getAllByRole('link', {
      name: /Open EDR timeline for EC2AMAZ-8F0Q7DL/i,
    });
    expect(timelineLinks.length).toBeGreaterThanOrEqual(2);
    expect(timelineLinks.every((link) => link.getAttribute('href') === '/edr/timeline/19')).toBe(
      true,
    );
    expect(screen.getByText('Open timeline').closest('a')).toHaveAttribute(
      'href',
      '/edr/timeline/19',
    );
  });

  it('filters the host grid by search text', async () => {
    const user = userEvent.setup();
    fetchSensors.mockResolvedValue({
      sensors: [
        SAMPLE_ROW,
        {
          ...SAMPLE_ROW,
          agentId: '42',
          hostname: 'wks-01',
        },
      ],
      total: 2,
    });
    render(
      <MemoryRouter>
        <EndpointsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('EC2AMAZ-8F0Q7DL')).toBeVisible();
    expect(screen.getByText('wks-01')).toBeVisible();

    await user.type(
      screen.getByRole('searchbox', { name: /Search endpoints/i }),
      'wks-01',
    );

    expect(screen.getByText('wks-01')).toBeVisible();
    expect(screen.queryByText('EC2AMAZ-8F0Q7DL')).toBeNull();
  });
});
