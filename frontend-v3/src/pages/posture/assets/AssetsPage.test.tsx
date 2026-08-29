import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetsPage, POSTURE_ASSETS_JOB_SENTENCE } from './AssetsPage';
import type { AssetDTO, AssetListResponse } from '../posture.types';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock('@/hooks/useEpsStream', () => ({
  useEpsStream: () => ({ connected: true, eps: 12840 }),
}));

vi.mock('@/components/status-dock', () => ({
  StatusDock: () => <div data-testid="status-dock">Connected · Live</div>,
}));

vi.mock('@/components/siem-data-grid', () => ({
  SiemDataGrid: React.forwardRef(function GridStub(
    {
      rowData,
      loading,
      onRowClicked,
    }: {
      rowData: AssetDTO[];
      loading: boolean;
      onRowClicked: (event: { data: AssetDTO }) => void;
    },
    _ref: React.Ref<unknown>,
  ) {
    if (loading) return <div aria-label="Loading asset inventory" />;
    return <div aria-label="Posture asset inventory">{rowData.map((asset) => <button key={asset.id} type="button" onClick={() => onRowClicked({ data: asset })}>{asset.clientName}</button>)}</div>;
  }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

vi.mock('../posture.service', () => ({
  assetFixtureMode: false,
  fetchAssets: vi.fn(),
  fetchAssetDetail: vi.fn(),
}));

const asset: AssetDTO = {
  id: 1,
  clientName: 'FIN-WKS-044',
  clientDomain: 'finance.example',
  clientPrefix: 'fin',
  clientMail: null,
  clientLicenceExpire: null,
  clientLicenceVerified: true,
  canonicalEntityId: 'entity-host-00001',
  category: 'endpoint',
  criticality: 'mission_critical',
  riskLevel: 'critical',
  riskScore: 97,
  exposureLevel: 'high',
  exposureScore: 82,
  sensorHealth: 'degraded',
  onboardingStatus: 'onboarded',
  activeAlertCount: 7,
  vulnerabilityCount: 22,
  criticalVulnerabilityCount: 3,
  attackPathCount: 2,
  platform: 'windows',
  ipAddress: '10.44.18.118',
  owner: 'Maya Chen',
  ownerTeam: 'Finance SecOps',
  tags: ['pci', 'workstation'],
  discoverySources: ['Endpoint sensor'],
  riskDrivers: [{ id: 'driver-1', label: 'Active endpoint alerts', kind: 'alert', severity: 'critical', evidenceCount: 7, summary: 'Seven active detections affect this host.' }],
  recommendations: [{ id: 'rec-1', title: 'Patch exposed service', priority: 'high', exposureReduction: 18, ownerTeam: 'Endpoint', state: 'open' }],
  coverage: [{ id: 'edr', name: 'Endpoint sensor', state: 'degraded', lastObserved: '2026-08-10T08:00:00Z' }],
};

const response: AssetListResponse = {
  content: [asset],
  totalElements: 84,
  totalPages: 2,
  number: 0,
  snapshotAt: '2026-08-10T08:00:00Z',
  summary: { total: 84, criticalAssets: 8, highRisk: 19, highExposure: 24, notOnboarded: 11, sensorAttention: 14, newlyDiscovered: 6 },
};

function queryState(overrides: Record<string, unknown> = {}) {
  return {
    data: response,
    dataUpdatedAt: Date.parse('2026-08-10T08:00:00Z'),
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockReturnValue(queryState());
});

describe('AssetsPage', () => {
  it('renders honesty chrome with inline stats and does not auto-open the detail drawer', () => {
    render(<AssetsPage />);

    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText(POSTURE_ASSETS_JOB_SENTENCE)).toBeInTheDocument();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
    expect(screen.getByLabelText('Inventory summary')).toHaveTextContent('84 total');
    expect(screen.getByRole('button', { name: 'FIN-WKS-044' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Asset detail views' })).not.toBeInTheDocument();
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
  });

  it('opens progressive risk and coverage detail only after explicit row selection', () => {
    render(<AssetsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'FIN-WKS-044' }));

    expect(screen.getByRole('navigation', { name: 'Asset detail views' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'risk' }));
    expect(screen.getByText('Risk drivers')).toBeInTheDocument();
    expect(screen.getByText('Patch exposed service')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'coverage' }));
    expect(screen.getByText('Telemetry coverage')).toBeInTheDocument();
  });

  it('updates the server query key when an analyst changes category', () => {
    render(<AssetsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Servers/ }));

    const latestCall = mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1];
    const latestOptions = latestCall?.[0] as { queryKey: [string, { category: string }] };
    expect(latestOptions.queryKey[1].category).toBe('server');
  });

  it('shows a useful filtered empty state with a clear action', () => {
    mockUseQuery.mockReturnValue(queryState({ data: { ...response, content: [], totalElements: 0, totalPages: 0 } }));
    render(<AssetsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Cloud/ }));

    expect(screen.getByText('No assets match these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('shows empty-inventory honesty distinct from filter-empty', () => {
    mockUseQuery.mockReturnValue(queryState({ data: { ...response, content: [], totalElements: 0, totalPages: 0, summary: { total: 0, criticalAssets: 0, highRisk: 0, highExposure: 0, notOnboarded: 0, sensorAttention: 0, newlyDiscovered: 0 } } }));
    render(<AssetsPage />);

    expect(screen.getByTestId('assets-empty-honesty')).toBeInTheDocument();
    expect(screen.queryByText('No assets match these filters')).not.toBeInTheDocument();
  });

  it('separates permission denial from a recoverable loading failure', () => {
    mockUseQuery.mockReturnValue(queryState({ data: undefined, error: new Error('403 Forbidden'), isError: true }));
    render(<AssetsPage />);

    expect(screen.getByText('Asset inventory access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry inventory' })).not.toBeInTheDocument();
  });
});
