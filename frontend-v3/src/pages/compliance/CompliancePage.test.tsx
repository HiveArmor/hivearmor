import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPLIANCE_ASSURANCE_JOB_SENTENCE, CompliancePage } from './CompliancePage';

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
    id: 'nist-csf-2',
    name: 'NIST Cybersecurity Framework',
    version: '2.0',
    description: 'Outcome coverage',
    controlCount: 106,
    overallScore: 79.2,
    lastAssessed: '2026-08-21T09:42:00Z',
  },
  {
    id: 'hipaa',
    name: 'HIPAA Security Rule',
    version: null,
    description: null,
    controlCount: 42,
    overallScore: 0,
    lastAssessed: null,
  },
];

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

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
    options.queryKey[0] === 'postureScore' ? queryState(score) : queryState(frameworks),
  );
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

  it('opens context only after explicit row selection and exposes canonical contract gaps', () => {
    render(<CompliancePage />);
    expect(screen.queryByText('Control and evidence workspace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'NIST Cybersecurity Framework' }));
    expect(screen.getByText('Control and evidence workspace')).toBeInTheDocument();
    expect(screen.getByText(/does not return assessment scope/i)).toBeInTheDocument();
    expect(screen.getByText(/will not fabricate these records/i)).toBeInTheDocument();
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
