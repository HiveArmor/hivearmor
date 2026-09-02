import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CisBenchmarkPage, POSTURE_CIS_BENCHMARK_JOB_SENTENCE } from './CisBenchmarkPage';

import { selectHaOption } from '@/test/haCompactSelect.testutil';
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

function catalogState() {
  return {
    data: [
      { packId: 'ha-linux-observed-ssh', packVersion: '1', reportingAgents: 2, lastScannedAt: '2026-08-13T10:00:00Z', source: 'observed-results', authority: 'HIVEARMOR', licenseState: 'SHIPPED_OBSERVED', officialBenchmark: false, title: 'HiveArmor observed Linux SSH/login files' },
      { packId: 'cis-linux', packVersion: 'unpublished', reportingAgents: 0, lastScannedAt: null, source: 'license-required', authority: 'CIS', licenseState: 'LICENSE_REQUIRED_NOT_SHIPPED', officialBenchmark: true, title: 'CIS Linux Benchmark (not shipped)' },
    ],
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === 'cis-assessment-summary') return summaryState();
    if (options.queryKey[0] === 'cis-result') return resultState({ data: check });
    if (options.queryKey[0] === 'cis-catalog') return catalogState();
    return resultState();
  });
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <CisBenchmarkPage />
    </MemoryRouter>,
  );
}

describe('CisBenchmarkPage', () => {
  it('renders honesty chrome, inline stats and the operational dock', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'CIS Benchmark' })).toBeInTheDocument();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
    expect(screen.getByText(POSTURE_CIS_BENCHMARK_JOB_SENTENCE)).toBeInTheDocument();
    expect(screen.getByLabelText('CIS assessment summary')).toHaveTextContent('15 failed');
    expect(screen.getByLabelText('CIS assessment summary')).toHaveTextContent('5 errors');
    expect(screen.getByLabelText('CIS assessment summary')).toHaveTextContent('80.0% pass rate');
    expect(screen.getByText(/Official CIS Benchmark content is not licensed/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vulnerabilities' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Detection Coverage' })).toBeInTheDocument();
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
    expect(screen.queryByText('CIS Benchmark Posture')).not.toBeInTheDocument();
    expect(screen.queryByText('Technical pass rate')).not.toBeInTheDocument();
  });

  it('starts with a bounded failed-check priority projection and updates server filters', () => {
    renderPage();
    let resultCalls = mockUseQuery.mock.calls.filter(([options]) => (options as { queryKey: unknown[] }).queryKey[0] === 'cis-results');
    let latest = resultCalls[resultCalls.length - 1]?.[0] as { queryKey: [string, Record<string, unknown>] };
    expect(latest.queryKey[1]).toMatchObject({ status: 'FAIL', page: 0, size: 50 });

    selectHaOption('Filter by outcome', 'Collection errors');
    selectHaOption('Filter by CIS profile', 'CIS Level 2');
    resultCalls = mockUseQuery.mock.calls.filter(([options]) => (options as { queryKey: unknown[] }).queryKey[0] === 'cis-results');
    latest = resultCalls[resultCalls.length - 1]?.[0] as { queryKey: [string, Record<string, unknown>] };
    expect(latest.queryKey[1]).toMatchObject({ status: 'ERROR', level: 'L2', page: 0, size: 50 });
  });

  it('opens evidence context only after explicit selection and preserves governance warnings', () => {
    renderPage();
    expect(screen.queryByText('Observed versus expected')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: check.checkId }));
    expect(screen.getByText('Observed versus expected')).toBeInTheDocument();
    expect(screen.getByText(/current contract has no command, file, registry/i)).toBeInTheDocument();
    expect(screen.getByText(/CIS benchmark mutations are not available/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Inspect endpoint/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /preview|execute/i })).not.toBeInTheDocument();
  });

  it('distinguishes permission denial from an empty assessment projection', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'cis-assessment-summary') return summaryState();
      if (options.queryKey[0] === 'cis-catalog') return catalogState();
      return resultState({ data: undefined, error: new Error('403 Forbidden'), isError: true });
    });
    renderPage();
    expect(screen.getByText('Benchmark posture access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry assessments' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('cis-empty-honesty')).not.toBeInTheDocument();
  });

  it('shows priority-view empty honesty without claiming secure configuration', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'cis-assessment-summary') return summaryState({ data: [] });
      if (options.queryKey[0] === 'cis-catalog') return catalogState();
      return resultState({ data: { results: [], total: 0 } });
    });
    renderPage();
    expect(screen.getByTestId('cis-empty-honesty')).toBeInTheDocument();
    expect(screen.getByText(/No failed checks in the default priority view/i)).toBeInTheDocument();
    expect(screen.getByText(/not proof of secure configuration/i)).toBeInTheDocument();
    expect(screen.queryByText('No checks match this view')).not.toBeInTheDocument();
  });

  it('shows true-empty honesty when all outcomes return no rows', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'cis-assessment-summary') return summaryState({ data: [] });
      if (options.queryKey[0] === 'cis-catalog') return catalogState();
      return resultState({ data: { results: [], total: 0 } });
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'View all outcomes' }));
    expect(screen.getByTestId('cis-empty-honesty')).toHaveAttribute('data-empty-kind', 'all-outcomes');
    expect(screen.getByText(/No assessment results were returned/i)).toBeInTheDocument();
    expect(screen.getByText(/Empty HTTP 200 is not a missing contract/i)).toBeInTheDocument();
  });
});
