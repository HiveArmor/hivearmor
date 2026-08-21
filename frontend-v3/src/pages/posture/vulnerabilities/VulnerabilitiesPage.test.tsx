import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VulnerabilitiesPage } from './VulnerabilitiesPage';

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
  mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === 'vulnerability-summary') return summaryState();
    if (options.queryKey[0] === 'vulnerability-finding') return findingsState({ data: finding });
    if (options.queryKey[0] === 'vulnerability-remediation') {
      return { data: { state: 'unavailable', reason: 'Governed remediation execute is not configured; HiveArmor will not invent a patch job.' }, error: null, isError: false, isFetching: false, isLoading: false, refetch: vi.fn() };
    }
    return findingsState();
  });
});

describe('VulnerabilitiesPage', () => {
  it('renders fleet context, the bounded queue and the shared operational dock', () => {
    render(<VulnerabilitiesPage />);
    expect(screen.getByText('Vulnerability Operations')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: finding.cveId })).toBeInTheDocument();
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
  });

  it('updates the server query key when severity and KEV filters change', () => {
    render(<VulnerabilitiesPage />);
    fireEvent.change(screen.getByLabelText('Filter by severity'), { target: { value: 'CRITICAL' } });
    fireEvent.change(screen.getByLabelText('Filter by exploitation evidence'), { target: { value: 'kev' } });

    const findingCalls = mockUseQuery.mock.calls.filter(([options]) => (options as { queryKey: unknown[] }).queryKey[0] === 'vulnerability-findings');
    const latest = findingCalls[findingCalls.length - 1]?.[0] as { queryKey: [string, { severity?: string; isKev?: boolean }] };
    expect(latest.queryKey[1]).toMatchObject({ severity: 'CRITICAL', isKev: true, page: 0, size: 50 });
  });

  it('opens finding context only after an explicit selection', () => {
    render(<VulnerabilitiesPage />);
    expect(screen.queryByText('Affected software')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: finding.cveId }));
    expect(screen.getByText('Affected software')).toBeInTheDocument();
    expect(screen.getByText('Known exploitation evidence')).toBeInTheDocument();
    expect(screen.getByText(/does not by itself prove exploitation/i)).toBeInTheDocument();
    expect(screen.getByText(/does not invent EPSS scores/i)).toBeInTheDocument();
    expect(screen.getByText(/will not invent a patch job/i)).toBeInTheDocument();
  });

  it('distinguishes access denial from an empty inventory', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => options.queryKey[0] === 'vulnerability-summary' ? summaryState() : findingsState({ data: undefined, error: new Error('403 Forbidden'), isError: true }));
    render(<VulnerabilitiesPage />);
    expect(screen.getByText('Vulnerability access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry findings' })).not.toBeInTheDocument();
  });

  it('warns that an unfiltered empty response is not proof of safety', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => options.queryKey[0] === 'vulnerability-summary' ? summaryState() : findingsState({ data: { findings: [], total: 0 } }));
    render(<VulnerabilitiesPage />);
    expect(screen.getByText('No vulnerability findings were returned')).toBeInTheDocument();
    expect(screen.getByText(/not proof of zero exposure/i)).toBeInTheDocument();
  });
});
