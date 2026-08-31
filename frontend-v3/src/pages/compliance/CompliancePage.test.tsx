import React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPLIANCE_ASSURANCE_JOB_SENTENCE, CompliancePage } from './CompliancePage';

import type { FrameworkControlResolution } from '@/types/compliance.types';
import type { HiveFrameworkScoreDTO, HivePostureScoreDTO } from '@/types/posture.types';

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => mockUseQuery(options) }));
vi.mock('@/hooks/useEpsStream', () => ({ useEpsStream: () => ({ connected: true, eps: 12840 }) }));
vi.mock('@/components/status-dock', () => ({
  StatusDock: () => <div data-testid="status-dock">Connected · Live</div>,
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/components/siem-data-grid', () => ({
  SiemDataGrid: React.forwardRef(function GridStub(
    {
      rowData,
      onRowClicked,
    }: {
      rowData: HiveFrameworkScoreDTO[];
      onRowClicked: (event: { data: HiveFrameworkScoreDTO }) => void;
    },
    _ref: React.Ref<unknown>,
  ) {
    return (
      <div aria-label="Compliance framework assessment inventory">
        {rowData.map((framework) => (
          <button
            key={framework.id}
            type="button"
            onClick={() => onRowClicked({ data: framework })}
          >
            {framework.name}
          </button>
        ))}
      </div>
    );
  }),
}));

const score: HivePostureScoreDTO = {
  overallScore: 76.8,
  totalFrameworks: 2,
  controlsPassed: 40,
  controlsFailed: 7,
  controlsTotal: 50,
  lastAssessed: '2026-08-21T09:42:00Z',
  trend: 'improving',
};
const frameworks: HiveFrameworkScoreDTO[] = [
  {
    id: '1',
    name: 'NIST Cybersecurity Framework',
    version: '2.0',
    description: 'Outcome coverage',
    controlCount: 106,
    overallScore: 79.2,
    lastAssessed: '2026-08-21T09:42:00Z',
  },
  {
    id: '2',
    name: 'HIPAA Security Rule',
    version: null,
    description: null,
    controlCount: 42,
    overallScore: 0,
    lastAssessed: null,
  },
];

const frameworkMapping: FrameworkControlResolution = {
  standardId: 1,
  sectionId: 10,
  sectionName: 'Access control',
  controlId: 42,
  controlName: 'Access control policy',
};

const cmpControl = {
  id: 42,
  standardSectionId: 10,
  controlName: 'Access control policy',
  controlStrategy: 'AUTOMATED',
  lastEvaluationStatus: 'PASS',
  lastEvaluationTimestamp: '2026-08-21T09:42:00Z',
};

function queryState(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    dataUpdatedAt: Date.parse('2026-08-21T09:42:00Z'),
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

const sectionControlsPage = {
  items: [
    cmpControl,
    {
      id: 43,
      standardSectionId: 10,
      controlName: 'Account management',
      controlStrategy: 'MANUAL',
      lastEvaluationStatus: 'FAIL',
      lastEvaluationTimestamp: '2026-08-20T09:42:00Z',
    },
  ],
  total: 2,
};

const frameworkSections = [
  { id: 10, standardId: 1, standardSectionName: 'Access control' },
  { id: 11, standardId: 1, standardSectionName: 'Audit' },
];

function resolveQuery(options: { queryKey: unknown[] }) {
  const key = String(options.queryKey[0]);
  if (key === 'postureScore') return queryState(score);
  if (key === 'postureFrameworks') return queryState(frameworks);
  if (key === 'compliance-framework-control') return queryState(frameworkMapping);
  if (key === 'compliance-framework-sections') return queryState(frameworkSections);
  if (key === 'compliance-section-controls') return queryState(sectionControlsPage);
  if (key === 'compliance-control-latest') return queryState(cmpControl);
  if (key === 'compliance-control-evaluations') {
    return queryState({ evaluations: [], startDate: null, endDate: null });
  }
  if (key === 'compliance-control-evidence') return queryState([]);
  return queryState(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockImplementation(resolveQuery);
});

describe('CompliancePage', () => {
  it('renders Wave B2 honesty chrome without presenting scores as certification', () => {
    render(<CompliancePage />);
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
    expect(screen.getByText(COMPLIANCE_ASSURANCE_JOB_SENTENCE)).toBeInTheDocument();
    expect(screen.getByText(/76\.8% aggregate/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not certification or legal attestation/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
    expect(screen.queryByText('Compliance Assurance')).not.toBeInTheDocument();
  });

  it('filters assessment state and never turns an unassessed framework into a zero score', () => {
    render(<CompliancePage />);
    fireEvent.change(screen.getByLabelText('Filter by assessment state'), {
      target: { value: 'not_assessed' },
    });
    expect(screen.getByRole('button', { name: 'HIPAA Security Rule' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'NIST Cybersecurity Framework' })).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 2 records/i)).toBeInTheDocument();
  });

  it('progressively loads CMP workspace with section-scoped control picker', () => {
    render(<CompliancePage />);
    expect(screen.queryByText('Control and evidence workspace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-control-picker')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-control-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-workspace-tab-controls')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-workspace-tab-actions')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-workspace-tab-exceptions')).toBeInTheDocument();
    expect(screen.getByLabelText('Select catalog section')).toBeInTheDocument();
    expect(screen.getByLabelText('Select catalog control')).toBeInTheDocument();
    const workspace = screen.getByTestId('cmp-control-workspace');
    expect(within(workspace).getByText('Access control policy')).toBeInTheDocument();
    expect(within(workspace).getByText(/Selected catalog control for/i)).toBeInTheDocument();
    expect(within(workspace).getByText('Access control')).toBeInTheDocument();
    expect(within(workspace).getByText(/No evidence was returned/i)).toBeInTheDocument();
    expect(screen.getByText(/does not return assessment scope/i)).toBeInTheDocument();
    expect(screen.queryByText(/Requires CMP-002 and CMP-003/i)).not.toBeInTheDocument();
  });

  it('shows honest blocked states on improvement actions and exceptions tabs', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-actions'));
    expect(screen.getByTestId('cmp-improvement_actions-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/POA&M persistence exists server-side/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry improvement actions/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-exceptions'));
    expect(screen.getByTestId('cmp-exceptions-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/governed approval lifecycle/i)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('cmp-control-workspace')).getByText(
        /Improvement actions and exceptions remain unavailable/i,
      ),
    ).toBeInTheDocument();
  });

  it('resets workspace tab when analyst selects a different catalog control', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-actions'));
    fireEvent.change(screen.getByLabelText('Select catalog control'), { target: { value: '43' } });
    expect(screen.getByTestId('cmp-workspace-tab-controls')).toHaveAttribute('aria-selected', 'true');
  });

  it('reloads workspace when analyst selects a different catalog control', () => {
    const latestQueries: unknown[][] = [];
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      latestQueries.push(options.queryKey);
      if (options.queryKey[0] === 'compliance-control-latest' && options.queryKey[1] === 43) {
        return queryState({
          ...cmpControl,
          id: 43,
          controlName: 'Account management',
          lastEvaluationStatus: 'FAIL',
        });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.change(screen.getByLabelText('Select catalog control'), { target: { value: '43' } });
    const workspace = screen.getByTestId('cmp-control-workspace');
    expect(within(workspace).getByText('Account management')).toBeInTheDocument();
    expect(latestQueries.some((key) => key[0] === 'compliance-control-latest' && key[1] === 43)).toBe(
      true,
    );
  });

  it('shows honest empty state when selected section has no controls', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'compliance-section-controls') {
        return queryState({ items: [], total: 0 });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByText(/No catalog controls were returned for this section/i)).toBeInTheDocument();
  });

  it('shows picker error and retry when section controls fail to load', () => {
    const refetch = vi.fn();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'compliance-section-controls') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true, refetch });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByRole('button', { name: 'Retry controls' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry controls' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows honest empty mapping when framework id is not a numeric standard id', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'postureFrameworks') {
        return queryState([
          {
            ...frameworks[0],
            id: 'nist-csf-2',
          },
        ]);
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-control-mapping-empty')).toBeInTheDocument();
    expect(screen.getByText(/not a numeric catalog standard id/i)).toBeInTheDocument();
  });

  it('shows honest empty mapping when catalog lookup returns no controls', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'compliance-framework-control') return queryState(null);
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-control-mapping-empty')).toBeInTheDocument();
    expect(screen.getByText(/No catalog sections or controls were returned/i)).toBeInTheDocument();
  });

  it('shows distinct CMP error state instead of fabricated records', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'compliance-control-latest') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByText('Control workspace unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry CMP read' })).toBeInTheDocument();
  });

  it('shows mapping error state when catalog lookup fails', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'compliance-framework-control') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-control-mapping-error')).toBeInTheDocument();
    expect(screen.getByText('Framework control mapping unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry catalog lookup' })).toBeInTheDocument();
  });

  it('distinguishes permission denial from an empty framework projection', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey[0] === 'postureScore'
        ? queryState(score)
        : queryState(undefined, { error: new Error('403 Forbidden'), isError: true }),
    );
    render(<CompliancePage />);
    expect(screen.getByText('Compliance assurance access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry framework inventory' })).not.toBeInTheDocument();
  });

  it('shows empty-honesty when inventory is empty with no filters', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey[0] === 'postureScore'
        ? queryState(undefined)
        : queryState([]),
    );
    render(<CompliancePage />);
    expect(screen.getByTestId('compliance-empty-honesty')).toBeInTheDocument();
    expect(screen.getByText(/not proof of compliance/i)).toBeInTheDocument();
  });

  it('folds aggregate score error into projection note while keeping framework rows', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey[0] === 'postureScore'
        ? queryState(undefined, { error: new Error('503'), isError: true })
        : queryState(frameworks),
    );
    render(<CompliancePage />);
    expect(screen.getByText(/Aggregate score unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' })).toBeInTheDocument();
  });
});
