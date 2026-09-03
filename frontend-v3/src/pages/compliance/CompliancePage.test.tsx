import React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPLIANCE_ASSURANCE_JOB_SENTENCE, CompliancePage } from './CompliancePage';

import { selectHaOption } from '@/test/haCompactSelect.testutil';
import type { FrameworkControlResolution } from '@/types/compliance.types';
import type { HiveFrameworkScoreDTO, HivePostureScoreDTO } from '@/types/posture.types';

const mockUseQuery = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { roles: string[] } | null }) => unknown) =>
    selector({ user: { roles: ['ROLE_ADMIN'] } }),
}));
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
  if (key === 'cmp-report-snapshots') {
    return queryState([
      {
        id: 9,
        reportName: 'NIST CSF export',
        standard: '1',
        status: 'Ready',
        createdDate: '2026-08-21T09:42:00Z',
        createdBy: 'admin',
      },
    ]);
  }
  if (key === 'cmp-scheduled-reports') {
    return queryState([
      {
        id: 3,
        name: 'Weekly NIST export',
        frequency: '0 0 * * 1',
        nextRun: '2026-09-01T00:00:00Z',
        status: 'Active',
      },
    ]);
  }
  if (key === 'cmp-report-configs') {
    return queryState([
      {
        id: 1235,
        configReportName: 'NIST Access Control Report',
        configSolution: 'NIST',
        standardSectionId: 10,
      },
      {
        id: 1236,
        configReportName: 'NIST Audit Report',
        configSolution: 'NIST',
        standardSectionId: 11,
      },
    ]);
  }
  if (key === 'cmp-improvement_actions') {
    return queryState([
      {
        id: 1,
        frameworkId: '1',
        controlId: '42',
        title: 'Patch cadence gap',
        description: null,
        dueDate: '2026-09-01',
        status: 'open',
        assignee: 'analyst',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-15T00:00:00Z',
        overdue: false,
      },
    ]);
  }
  if (key === 'cmp-exceptions') {
    return queryState([
      {
        id: 2,
        controlId: 42,
        title: 'Legacy auth waiver',
        reason: 'Migration window',
        status: 'approved',
        effectiveFrom: '2026-07-01',
        effectiveUntil: '2026-12-31',
        approver: 'soc-manager',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-15T00:00:00Z',
      },
    ]);
  }
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
    selectHaOption('Filter by assessment state', 'Not yet assessed');
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
    expect(screen.getByTestId('cmp-workspace-tab-history')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-workspace-tab-actions')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-workspace-tab-exceptions')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-framework-reports')).toBeInTheDocument();
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

  it('loads improvement actions when POA&M read contract is authorized', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-actions'));
    expect(screen.getByTestId('cmp-improvement-actions-list')).toBeInTheDocument();
    expect(screen.getByText('Patch cadence gap')).toBeInTheDocument();
    expect(screen.queryByTestId('cmp-improvement_actions-unavailable')).not.toBeInTheDocument();
  });

  it('shows improvement actions empty state', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-improvement_actions') {
        return queryState([]);
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-actions'));
    expect(screen.getByTestId('cmp-improvement_actions-empty')).toBeInTheDocument();
  });

  it('shows improvement actions error and retry', () => {
    const refetch = vi.fn();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-improvement_actions') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true, refetch });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-actions'));
    expect(screen.getByText('Improvement actions unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry improvement actions' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('loads exceptions when read contract is authorized', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-exceptions'));
    expect(screen.getByTestId('cmp-exceptions-list')).toBeInTheDocument();
    expect(screen.getByText('Legacy auth waiver')).toBeInTheDocument();
    expect(screen.queryByTestId('cmp-exceptions-unavailable')).not.toBeInTheDocument();
  });

  it('shows exceptions empty state', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-exceptions') {
        return queryState([]);
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-exceptions'));
    expect(screen.getByTestId('cmp-exceptions-empty')).toBeInTheDocument();
  });

  it('shows exceptions error and retry', () => {
    const refetch = vi.fn();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-exceptions') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true, refetch });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-exceptions'));
    expect(screen.getByText('Exceptions unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry exceptions' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows evaluation history empty state on history tab', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-history'));
    expect(screen.getByTestId('cmp-evaluation_history-empty')).toBeInTheDocument();
  });

  it('shows evaluation history error and retry', () => {
    const refetch = vi.fn();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'compliance-control-evaluations') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true, refetch });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-history'));
    expect(screen.getByText('Evaluation history unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry evaluation history' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('loads report snapshots with PDF export when read contract is authorized', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    const reportsPanel = screen.getByTestId('cmp-framework-reports');
    expect(within(reportsPanel).getByTestId('cmp-report-snapshots-list')).toBeInTheDocument();
    expect(within(reportsPanel).getByText('NIST CSF export')).toBeInTheDocument();
    expect(within(reportsPanel).getByTestId('cmp-report-export-9')).toHaveAttribute(
      'href',
      '/api/ha-compliance-report-config/9/export',
    );
    expect(within(reportsPanel).getByText(/Report regeneration and deletion require Platform Administrator/i)).toBeInTheDocument();
  });

  it('shows report snapshots empty state', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-report-snapshots') {
        return queryState([]);
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-report_snapshots-empty')).toBeInTheDocument();
  });

  it('shows report snapshots error and retry', () => {
    const refetch = vi.fn();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-report-snapshots') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true, refetch });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByText('Report snapshots unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry report snapshots' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('loads scheduled reports when read contract is authorized', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-framework-schedules')).toBeInTheDocument();
    expect(screen.getByTestId('cmp-scheduled-reports-list')).toBeInTheDocument();
    expect(screen.getByText('Weekly NIST export')).toBeInTheDocument();
    expect(screen.getByText(/Schedule create and delete require Platform Administrator/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cmp-scheduled_reports-unavailable')).not.toBeInTheDocument();
  });

  it('picks a report config from catalog instead of a manual ID for schedule create', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-schedule-add'));
    expect(screen.getByTestId('cmp-schedule-form')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Report config ID/i)).not.toBeInTheDocument();
    const picker = screen.getByRole('button', { name: 'Select report config for schedule' });
    expect(picker).toBeInTheDocument();
    fireEvent.click(picker);
    const listbox = screen.getByRole('listbox', { name: 'Select report config for schedule' });
    expect(within(listbox).getByRole('option', { name: /NIST Access Control Report \(#1235\)/ })).toBeInTheDocument();
    fireEvent.click(within(listbox).getByRole('option', { name: /NIST Audit Report \(#1236\)/ }));
    expect(screen.getByRole('button', { name: 'Select report config for schedule' })).toHaveTextContent(/NIST Audit Report/);
  });

  it('shows honest empty state when framework has no report configs for schedule create', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-report-configs') {
        return queryState([]);
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-schedule-add'));
    expect(screen.getByTestId('cmp-schedule-config-empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeDisabled();
  });

  it('shows scheduled reports empty state', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-scheduled-reports') {
        return queryState([]);
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByTestId('cmp-scheduled_reports-empty')).toBeInTheDocument();
  });

  it('shows scheduled reports error and retry', () => {
    const refetch = vi.fn();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0]);
      if (key === 'cmp-scheduled-reports') {
        return queryState(undefined, { error: new Error('503 upstream'), isError: true, refetch });
      }
      return resolveQuery(options);
    });
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByText('Scheduled reports unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry scheduled reports' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('resets workspace tab when analyst selects a different catalog control', () => {
    render(<CompliancePage />);
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    fireEvent.click(screen.getByTestId('cmp-workspace-tab-actions'));
    selectHaOption('Select catalog control', 'Account management');
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
    selectHaOption('Select catalog control', 'Account management');
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
