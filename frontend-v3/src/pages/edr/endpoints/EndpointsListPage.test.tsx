/**
 * EndpointsListPage tests — agent inventory empty/error without AG Grid overlay errors
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EndpointsListPage } from './EndpointsListPage';

const fetchSensors = vi.hoisted(() => vi.fn());

vi.mock('@/services/sensorsService', () => ({
  fetchSensors,
}));

describe('EndpointsListPage', () => {
  beforeEach(() => {
    fetchSensors.mockReset();
  });

  it('renders an honest empty inventory when no agents are registered', async () => {
    fetchSensors.mockResolvedValue({ sensors: [], total: 0 });
    render(
      <MemoryRouter>
        <EndpointsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No agents registered')).toBeVisible();
    expect(screen.getByText('Endpoint Telemetry')).toBeVisible();
  });

  it('renders an error state when the agent list cannot be loaded', async () => {
    fetchSensors.mockRejectedValue(new Error('GET /api/agent-manager/agents: 500'));
    render(
      <MemoryRouter>
        <EndpointsListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Endpoint telemetry is unavailable')).toBeVisible();
    expect(screen.getByText(/agent-manager\/agents: 500/)).toBeVisible();
  });
});
