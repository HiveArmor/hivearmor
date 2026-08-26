import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SensorFleetSummary } from './SensorFleetSummary';

import type { SensorDTO } from '@/services/sensorsService';

const mockSummary = vi.fn();

vi.mock('@/services/agentPackage.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/agentPackage.service')>(
    '@/services/agentPackage.service'
  );
  return {
    ...actual,
    fetchAgentPackageSummary: (...args: unknown[]) => mockSummary(...args),
  };
});

const sensors: SensorDTO[] = [
  {
    agentId: '1',
    hostname: 'online-host',
    platform: 'linux',
    osVersion: '24.04',
    agentVersion: '11.0.0-staging',
    connectionStatus: 'ONLINE',
    lastSeen: '2026-08-26T00:00:00Z',
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    collectorType: 'agent',
    mode: null,
    bundleVersion: null,
  },
  {
    agentId: '2',
    hostname: 'old-host',
    platform: 'linux',
    osVersion: '22.04',
    agentVersion: '10.0.0',
    connectionStatus: 'OFFLINE',
    lastSeen: '2026-08-01T00:00:00Z',
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    collectorType: 'agent',
    mode: null,
    bundleVersion: null,
  },
];

function renderSummary(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SensorFleetSummary sensors={sensors} />
    </QueryClientProvider>
  );
}

describe('SensorFleetSummary', () => {
  beforeEach(() => {
    mockSummary.mockReset();
  });

  it('shows online/offline counts and latest published version', async () => {
    mockSummary.mockResolvedValue({
      latestVersion: '11.0.0-staging',
      updaterVersion: '11.0.0-staging',
      publishedCount: 2,
      totalCount: 6,
      packages: [],
    });

    renderSummary();

    expect(await screen.findByText('11.0.0-staging')).toBeVisible();
    expect(screen.getByLabelText('Sensor fleet summary')).toBeVisible();
    expect(screen.getByText('2/6')).toBeVisible();
    expect(screen.getByText('Behind latest')).toBeVisible();
    const behindStat = screen.getByText('Behind latest').closest('.sensor-fleet-summary__stat');
    expect(behindStat).toHaveTextContent('1');
  });
});
