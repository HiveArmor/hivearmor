import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnomalyCountsDTO, HaUebaDeviationDTO, UserRiskDTO } from '@/types/ueba.types';

const mockRoles: string[] = [];

const MOCK_DEVIATIONS: HaUebaDeviationDTO[] = [
  {
    userId: 'fixture-user-alpha',
    metricName: 'failed_logon_ratio',
    runTs: '2026-09-07T14:00:00Z',
    zScore: 4.6,
    points: 50,
  },
];

const MOCK_RISK: UserRiskDTO[] = [
  {
    userId: 'fixture-user-alpha',
    totalScore: 75,
    anomalyCount: 1,
    topMetric: 'failed_logon_ratio',
    lastUpdated: '2026-09-07T14:00:00Z',
  },
];

const MOCK_COUNTS: AnomalyCountsDTO = { tier10: 0, tier25: 0, tier50: 1 };

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { roles: string[] } | null }) => unknown) =>
    selector({ user: { roles: mockRoles } }),
}));

vi.mock('@/services/ueba.service', () => ({
  getDeviations: vi.fn().mockResolvedValue(MOCK_DEVIATIONS),
  getRiskScores: vi.fn().mockResolvedValue(MOCK_RISK),
  getAnomalyCounts: vi.fn().mockResolvedValue(MOCK_COUNTS),
  uebaFixtureMode: false,
}));

vi.mock('@/components/siem-data-grid/SiemDataGrid', () => ({
  SiemDataGrid: (props: { rowData: Array<{ userId: string }> }) => (
    <div data-testid="siem-data-grid">
      {props.rowData.map((row) => (
        <div key={row.userId}>{row.userId}</div>
      ))}
    </div>
  ),
}));

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DetectionUebaPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let DetectionUebaPanel: typeof import('./DetectionUebaPanel').DetectionUebaPanel;

describe('DetectionUebaPanel', () => {
  beforeEach(async () => {
    mockRoles.splice(0, mockRoles.length, 'ROLE_ANALYST');
    const mod = await import('./DetectionUebaPanel');
    DetectionUebaPanel = mod.DetectionUebaPanel;
  });

  it('denies Read Only with a human permission label', async () => {
    mockRoles.splice(0, mockRoles.length, 'ROLE_USER');
    renderPanel();
    expect(await screen.findByTestId('detection-ueba-denied')).toBeInTheDocument();
    expect(screen.getByText(/Required permission: Analyst, SOC Manager, or Platform Administrator/)).toBeVisible();
  });

  it('renders live deviation findings and model honesty for Analyst', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('detection-ueba-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('detection-ueba-honesty')).toHaveTextContent(/not a trained ML model/i);
    expect(screen.getAllByText('fixture-user-alpha').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /open ueba risk/i })).toHaveAttribute('href', '/ueba/risk');
  });
});
