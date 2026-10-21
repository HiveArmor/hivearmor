/**
 * EndpointPostureTab tests (PT-5, Option A).
 *
 * Covers the page's core honesty rule for the per-host posture surface:
 *   - CIS not-scanned → explicit "Not scanned yet", NEVER a fabricated 100%.
 *   - CIS scanned     → score + donut + control grid render.
 *   - Vuln no findings → "No vulnerability findings" (distinct from not-scanned).
 *   - Vuln findings    → severity bar + grid render.
 *
 * HaChart (ECharts/canvas) and SiemDataGrid (ag-grid) are mocked to plain
 * elements so jsdom never touches canvas or the grid runtime.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EndpointPostureTab } from './EndpointPostureTab';

import type { CisScanSummaryDTO } from '@/types/cisScan.types';

const mocks = vi.hoisted(() => ({
  fetchCisScanSummaryByAgent: vi.fn(),
  fetchCisScanResultsByAgent: vi.fn(),
  fetchVulnFindingsByAgent: vi.fn(),
}));

vi.mock('@/services/cisScanService', () => ({
  fetchCisScanSummaryByAgent: mocks.fetchCisScanSummaryByAgent,
  fetchCisScanResultsByAgent: mocks.fetchCisScanResultsByAgent,
}));

vi.mock('@/services/vulnService', () => ({
  fetchVulnFindingsByAgent: mocks.fetchVulnFindingsByAgent,
}));

vi.mock('@/components/ha-chart/HaChart', () => ({
  HaChart: () => <div data-testid="ha-chart" />,
}));

vi.mock('@/components/siem-data-grid/SiemDataGrid', () => ({
  SiemDataGrid: ({ rowData }: { rowData?: unknown[] }) => (
    <div data-testid="siem-grid" data-rows={(rowData ?? []).length} />
  ),
}));

function renderTab(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EndpointPostureTab agentId="7" />
    </QueryClientProvider>,
  );
}

const SCANNED_SUMMARY: CisScanSummaryDTO = {
  scanned: true,
  scanId: 's1',
  agentId: '7',
  hostname: 'host-7',
  profile: 'CIS_Ubuntu_22.04_L1',
  benchmark: 'ssg-ubuntu',
  contentHash: 'abc123',
  mode: 'scheduled',
  total: 10,
  passCount: 7,
  failCount: 2,
  errorCount: 1,
  naCount: 0,
  notCheckedCount: 0,
  scorePct: 70,
  durationMs: 1200,
  scannedAt: '2026-10-20T10:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchVulnFindingsByAgent.mockResolvedValue({ findings: [], total: 0 });
});

describe('EndpointPostureTab — CIS honesty', () => {
  it('shows an explicit not-scanned state (never a fabricated 100%)', async () => {
    mocks.fetchCisScanSummaryByAgent.mockResolvedValue(CisScanSummaryNotScanned());
    renderTab();
    expect(await screen.findByText(/not scanned yet/i)).toBeInTheDocument();
    // No fabricated score is rendered.
    expect(screen.queryByText(/100/)).not.toBeInTheDocument();
    // Results endpoint is NOT called when the host is unscanned.
    expect(mocks.fetchCisScanResultsByAgent).not.toHaveBeenCalled();
  });

  it('renders the score and control grid when scanned', async () => {
    mocks.fetchCisScanSummaryByAgent.mockResolvedValue(SCANNED_SUMMARY);
    mocks.fetchCisScanResultsByAgent.mockResolvedValue([
      { controlId: 'c1', title: 't1', severity: 'high', status: 'FAIL', scanId: 's1' },
      { controlId: 'c2', title: 't2', severity: 'low', status: 'PASS', scanId: 's1' },
    ]);
    renderTab();
    expect(await screen.findByText('70.0%')).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchCisScanResultsByAgent).toHaveBeenCalledWith('7', undefined, expect.anything()));
  });
});

describe('EndpointPostureTab — vuln honesty', () => {
  it('shows "no findings" distinct from not-scanned when the host has zero CVEs', async () => {
    mocks.fetchCisScanSummaryByAgent.mockResolvedValue(CisScanSummaryNotScanned());
    renderTab();
    expect(await screen.findByText(/no vulnerability findings/i)).toBeInTheDocument();
  });

  it('renders findings grid when CVEs are present', async () => {
    mocks.fetchCisScanSummaryByAgent.mockResolvedValue(CisScanSummaryNotScanned());
    mocks.fetchVulnFindingsByAgent.mockResolvedValue({
      findings: [
        { id: 1, agentId: '7', agentHostname: 'host-7', cveId: 'CVE-2026-1', packageName: 'openssl', installedVersion: '1.0', fixedVersion: '1.1', cvssV3: 9.1, severity: 'CRITICAL', kev: true, description: null, references: null, publishedAt: null, firstSeenAt: '', lastSeenAt: '' },
      ],
      total: 1,
    });
    renderTab();
    const grids = await screen.findAllByTestId('siem-grid');
    // The vuln grid should carry the single finding row.
    expect(grids.some((g) => g.getAttribute('data-rows') === '1')).toBe(true);
  });
});

function CisScanSummaryNotScanned(): CisScanSummaryDTO {
  return {
    scanned: false,
    scanId: null,
    agentId: '7',
    hostname: null,
    profile: null,
    benchmark: null,
    contentHash: null,
    mode: null,
    total: 0,
    passCount: 0,
    failCount: 0,
    errorCount: 0,
    naCount: 0,
    notCheckedCount: 0,
    scorePct: 0,
    durationMs: 0,
    scannedAt: null,
  };
}
