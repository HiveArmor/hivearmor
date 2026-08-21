import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CisBenchmarkPage } from './CisBenchmarkPage';

import type { ScaResultDTO, ScaSummaryDTO } from '@/types/vuln.types';

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
    { rowData, onRowClicked }: { rowData: ScaResultDTO[]; onRowClicked: (event: { data: ScaResultDTO }) => void },
    _ref: React.Ref<unknown>,
  ) {
    return <div aria-label="CIS benchmark assessment results">{rowData.map((check) => <button key={check.id} type="button" onClick={() => onRowClicked({ data: check })}>{check.checkId}</button>)}</div>;
  }),
}));

const check: ScaResultDTO = {
  id: 7,
  agentId: 'agent-fin-044',
  agentHostname: 'FIN-WKS-044',
  checkId: 'CIS-1.1.1',
  checkTitle: 'Ensure a secure configuration is applied',
  packId: 'cis-windows-2026',
  level: 'L1',
  status: 'FAIL',
  observedValue: 'Disabled',
  expectedValue: 'Enabled',
  remediation: 'Review change impact, then enable the managed policy.',
  mitre: ['T1562.001'],
  complianceTags: ['CIS-1.1.1'],
  scannedAt: '2026-08-13T10:00:00Z',
};

const summary: ScaSummaryDTO = {
  id: 1,
  agentId: 'agent-fin-044',
  agentHostname: 'FIN-WKS-044',
  packId: 'cis-windows-2026',
  total: 110,
  passCount: 80,
  failCount: 15,
  naCount: 10,
  errorCount: 5,
  scorePct: 80,
  scannedAt: '2026-08-13T10:00:00Z',
};

function resultState(overrides: Record<string, unknown> = {}) {
  return {
    data: { results: [check], total: 51 },
    dataUpdatedAt: Date.parse('2026-08-13T10:00:00Z'),
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function summaryState(overrides: Record<string, unknown> = {}) {
  return {
    data: [summary],
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
  mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === 'cis-summary') return summaryState();
    if (options.queryKey[0] === 'cis-result') return resultState({ data: check });
    if (options.queryKey[0] === 'cis-catalog') return { data: [
      { packId: 'ha-linux-observed-ssh', packVersion: '1', reportingAgents: 2, lastScannedAt: '2026-08-13T10:00:00Z', source: 'observed-results', authority: 'HIVEARMOR', licenseState: 'SHIPPED_OBSERVED', officialBenchmark: false, title: 'HiveArmor observed Linux SSH/login files' },
      { packId: 'cis-linux', packVersion: 'unpublished', reportingAgents: 0, lastScannedAt: null, source: 'license-required', authority: 'CIS', licenseState: 'LICENSE_REQUIRED_NOT_SHIPPED', officialBenchmark: true, title: 'CIS Linux Benchmark (not shipped)' },
    ], error: null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };
    return resultState();
  });
});

describe('CisBenchmarkPage', () => {
  it('renders a weighted technical rate, explicit unknown outcomes and the operational dock', () => {
    render(<CisBenchmarkPage />);
    expect(screen.getByText('CIS Benchmark Posture')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/observed packs, not official CIS applicability/i)).toBeInTheDocument();
    expect(screen.getByText(/Official CIS Benchmark content is not licensed/i)).toBeInTheDocument();
  });

  it('starts with a bounded failed-check priority projection and updates server filters', () => {
    render(<CisBenchmarkPage />);
    let resultCalls = mockUseQuery.mock.calls.filter(([options]) => (options as { queryKey: unknown[] }).queryKey[0] === 'cis-results');
    let latest = resultCalls[resultCalls.length - 1]?.[0] as { queryKey: [string, Record<string, unknown>] };
    expect(latest.queryKey[1]).toMatchObject({ status: 'FAIL', page: 0, size: 50 });

    fireEvent.change(screen.getByLabelText('Filter by outcome'), { target: { value: 'ERROR' } });
    fireEvent.change(screen.getByLabelText('Filter by CIS profile'), { target: { value: 'L2' } });
    resultCalls = mockUseQuery.mock.calls.filter(([options]) => (options as { queryKey: unknown[] }).queryKey[0] === 'cis-results');
    latest = resultCalls[resultCalls.length - 1]?.[0] as { queryKey: [string, Record<string, unknown>] };
    expect(latest.queryKey[1]).toMatchObject({ status: 'ERROR', level: 'L2', page: 0, size: 50 });
  });

  it('opens evidence context only after explicit selection and preserves governance warnings', () => {
    render(<CisBenchmarkPage />);
    expect(screen.queryByText('Observed versus expected')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: check.checkId }));
    expect(screen.getByText('Observed versus expected')).toBeInTheDocument();
    expect(screen.getByText(/current contract has no command, file, registry/i)).toBeInTheDocument();
    expect(screen.getByText(/rescan, exception and remediation actions remain unavailable/i)).toBeInTheDocument();
  });

  it('distinguishes permission denial from an empty assessment projection', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => options.queryKey[0] === 'cis-summary' ? summaryState() : resultState({ data: undefined, error: new Error('403 Forbidden'), isError: true }));
    render(<CisBenchmarkPage />);
    expect(screen.getByText('Benchmark posture access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry assessments' })).not.toBeInTheDocument();
  });

  it('does not present missing assessment data as proof of secure configuration', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => options.queryKey[0] === 'cis-summary' ? summaryState({ data: [] }) : resultState({ data: { results: [], total: 0 } }));
    render(<CisBenchmarkPage />);
    fireEvent.change(screen.getByLabelText('Filter by outcome'), { target: { value: 'all' } });
    expect(screen.getByText('No assessment results were returned')).toBeInTheDocument();
    expect(screen.getByText(/not proof of secure configuration/i)).toBeInTheDocument();
  });
});
