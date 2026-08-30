import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POSTURE_VULNERABILITIES_JOB_SENTENCE, VulnerabilitiesPage } from './VulnerabilitiesPage';

import type { VulnFindingDTO } from '@/types/vuln.types';

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
    { rowData, onRowClicked }: { rowData: VulnFindingDTO[]; onRowClicked: (event: { data: VulnFindingDTO }) => void },
    _ref: React.Ref<unknown>,
  ) {
    return <div aria-label="Vulnerability findings">{rowData.map((finding) => <button key={finding.id} type="button" onClick={() => onRowClicked({ data: finding })}>{finding.cveId}</button>)}</div>;
  }),
}));

const finding: VulnFindingDTO = {
  id: 1,
  agentId: 'agent-fin-044',
  agentHostname: 'FIN-WKS-044',
  cveId: 'CVE-2026-4100',
  purl: 'pkg:maven/example/component@1.0.0',
  packageName: 'example-component',
  installedVersion: '1.0.0',
  fixedVersion: '1.0.1',
  cvssV3: 9.8,
  severity: 'CRITICAL',
  kev: true,
  description: 'A bounded test finding.',
  references: null,
  publishedAt: '2026-08-01T10:00:00Z',
  firstSeenAt: '2026-08-10T10:00:00Z',
  lastSeenAt: '2026-08-13T10:00:00Z',
};

function findingsState(overrides: Record<string, unknown> = {}) {
  return {
    data: { findings: [finding], total: 61 },
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
    data: { critical: 12, high: 19, medium: 24, low: 5, info: 1, kevCount: 4, affectedAgents: 16, topCves: [] },
    dataUpdatedAt: Date.parse('2026-08-13T10:00:00Z'),
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
  window.history.replaceState({}, '', '/posture/vulnerabilities');
  mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === 'vulnerability-summary') return summaryState();
    if (options.queryKey[0] === 'vulnerability-finding') return findingsState({ data: finding });
    if (options.queryKey[0] === 'vulnerability-remediation') {
      return { data: { state: 'unavailable', reason: 'Governed remediation execute is not configured; HiveArmor will not invent a patch job.' }, error: null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };
    }
    if (options.queryKey[0] === 'vulnerability-connectors') {
      return { data: [{ id: 'patch-job', name: 'Patch job', kind: 'patch', state: 'not_configured', note: 'Not configured' }], error: null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };
    }
    return findingsState();
  });
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <VulnerabilitiesPage />
    </MemoryRouter>,
  );
}

describe('VulnerabilitiesPage', () => {
  it('renders honesty chrome, inline stats, bounded queue and the shared operational dock', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Vulnerabilities' })).toBeInTheDocument();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
    expect(screen.getByText(POSTURE_VULNERABILITIES_JOB_SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Assets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exposure' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CIS Benchmark' })).toBeInTheDocument();
    expect(screen.getByLabelText('Vulnerability summary')).toHaveTextContent('12 critical');
    expect(screen.getByRole('button', { name: finding.cveId })).toBeInTheDocument();
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
    expect(screen.queryByText('Vulnerability Operations')).not.toBeInTheDocument();
  });

  it('updates the server query key when severity and KEV filters change', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Filter by severity'), { target: { value: 'CRITICAL' } });
    fireEvent.change(screen.getByLabelText('Filter by exploitation evidence'), { target: { value: 'kev' } });

    const findingCalls = mockUseQuery.mock.calls.filter(([options]) => (options as { queryKey: unknown[] }).queryKey[0] === 'vulnerability-findings');
    const latest = findingCalls[findingCalls.length - 1]?.[0] as { queryKey: [string, { severity?: string; isKev?: boolean }] };
    expect(latest.queryKey[1]).toMatchObject({ severity: 'CRITICAL', isKev: true, page: 0, size: 50 });
  });

  it('opens finding context only after an explicit selection', () => {
    renderPage();
    expect(screen.queryByText('Affected software')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: finding.cveId }));
    expect(screen.getByText('Affected software')).toBeInTheDocument();
    expect(screen.getByText('Known exploitation evidence')).toBeInTheDocument();
    expect(screen.getByText(/does not by itself prove exploitation/i)).toBeInTheDocument();
    expect(screen.getByText(/does not invent EPSS scores/i)).toBeInTheDocument();
    expect(screen.getAllByText(/will not invent a patch job/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Hunt this CVE/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Execute/i })).not.toBeInTheDocument();
  });

  it('distinguishes access denial from an empty inventory', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'vulnerability-summary') return summaryState();
      if (options.queryKey[0] === 'vulnerability-connectors') return { data: [], error: null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };
      return findingsState({ data: undefined, error: new Error('403 Forbidden'), isError: true });
    });
    renderPage();
    expect(screen.getByText('Vulnerability access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry findings' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('vulnerabilities-empty-honesty')).not.toBeInTheDocument();
  });

  it('shows empty-inventory honesty distinct from filter-empty', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'vulnerability-summary') return summaryState({ data: { critical: 0, high: 0, medium: 0, low: 0, info: 0, kevCount: 0, affectedAgents: 0, topCves: [] } });
      if (options.queryKey[0] === 'vulnerability-connectors') return { data: [], error: null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };
      return findingsState({ data: { findings: [], total: 0 } });
    });
    renderPage();
    expect(screen.getByTestId('vulnerabilities-empty-honesty')).toBeInTheDocument();
    expect(screen.getByText(/not proof of zero exposure/i)).toBeInTheDocument();
    expect(screen.queryByText('No findings match these filters')).not.toBeInTheDocument();
  });
});
