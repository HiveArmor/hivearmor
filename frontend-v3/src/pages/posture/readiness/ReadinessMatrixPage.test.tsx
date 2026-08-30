import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  POSTURE_DETECTION_COVERAGE_JOB_SENTENCE,
  ReadinessMatrixPage,
} from './ReadinessMatrixPage';

import type { RuleRefDTO, TechniqueCoverageDTO } from '@/types/mitre.types';

const mockUseQuery = vi.fn();
const getCoverage = vi.fn();
const getRulesByTechnique = vi.fn();
const exportCoverage = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock('@/hooks/useEpsStream', () => ({
  useEpsStream: () => ({ connected: true, eps: 4200 }),
}));

vi.mock('@/components/status-dock', () => ({
  StatusDock: () => <div data-testid="status-dock">Connected · Historical</div>,
}));

vi.mock('@/components/ha-drawer/HaDrawer', () => ({
  HaDrawer: ({
    title,
    children,
    onClose,
  }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={onClose}>
        Close drawer
      </button>
      {children}
    </div>
  ),
}));

vi.mock('@/services/mitre.service', () => ({
  mitreService: {
    getCoverage: (...args: unknown[]) => getCoverage(...args),
    getRulesByTechnique: (...args: unknown[]) => getRulesByTechnique(...args),
    exportCoverage: (...args: unknown[]) => exportCoverage(...args),
  },
}));

const techniques: TechniqueCoverageDTO[] = [
  { technique: 'T1003.001', ruleCount: 4, activeCount: 2 },
  { technique: 'T1059.001', ruleCount: 1, activeCount: 0 },
];

const rules: RuleRefDTO[] = [
  { id: 11, name: 'LSASS dump via comsvcs', active: true },
  { id: 12, name: 'Credential access heuristic', active: false },
];

function coverageState(overrides: Record<string, unknown> = {}) {
  return {
    data: techniques,
    dataUpdatedAt: Date.parse('2026-08-30T10:00:00Z'),
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function rulesState(overrides: Record<string, unknown> = {}) {
  return {
    data: rules,
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
  mockUseQuery.mockImplementation((options: { queryKey: unknown[]; enabled?: boolean }) => {
    if (options.queryKey[0] === 'mitreRules') {
      if (options.enabled === false) {
        return rulesState({ data: undefined, isLoading: false });
      }
      return rulesState();
    }
    return coverageState();
  });
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <ReadinessMatrixPage />
    </MemoryRouter>,
  );
}

describe('ReadinessMatrixPage', () => {
  it('renders honesty chrome, inline stats, matrix cells, and the shared operational dock', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Detection Coverage' })).toBeInTheDocument();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
    expect(screen.getByText(POSTURE_DETECTION_COVERAGE_JOB_SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mission Control' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Detection Rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CIS Benchmark' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Detection coverage summary')).toHaveTextContent(
      '1 with ≥1 active rule',
    );
    expect(screen.getByLabelText('Detection coverage summary')).toHaveTextContent(
      '1 uncovered (0 active)',
    );
    expect(
      screen.getByRole('button', { name: 'T1003.001: 2 active of 4 rules' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
    expect(screen.queryByTestId('detection-coverage-empty-honesty')).not.toBeInTheDocument();
  });

  it('shows empty-honesty when coverage is an empty array and keeps the matrix shell', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'mitreRules') return rulesState({ data: undefined });
      return coverageState({ data: [] });
    });
    renderPage();
    expect(screen.getByTestId('detection-coverage-empty-honesty')).toBeInTheDocument();
    expect(screen.getByText(/not proof of full ATT&CK coverage/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Detection coverage matrix')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export MITRE coverage CSV/i })).not.toBeInTheDocument();
  });

  it('keeps header chrome on API error and does not claim empty coverage', () => {
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === 'mitreRules') return rulesState({ data: undefined });
      return coverageState({
        data: undefined,
        isError: true,
        error: new Error('upstream unavailable'),
      });
    });
    renderPage();
    expect(screen.getByText('Coverage projection unavailable')).toBeInTheDocument();
    expect(screen.getByText('upstream unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('detection-coverage-empty-honesty')).not.toBeInTheDocument();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
  });

  it('opens technique drawer with mapped rules on cell click', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'T1003.001: 2 active of 4 rules' }));
    expect(await screen.findByRole('dialog', { name: 'T1003.001' })).toBeInTheDocument();
    expect(screen.getByText('LSASS dump via comsvcs')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('exports CSV when coverage exists and fails closed without inventing a file', async () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mitre');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: click });
      }
      return el;
    });
    exportCoverage.mockResolvedValue(new Blob(['technique,active\n'], { type: 'text/csv' }));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Export MITRE coverage CSV' }));
    await waitFor(() => expect(exportCoverage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

    exportCoverage.mockRejectedValue(new Error('export denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Export MITRE coverage CSV' }));
    await waitFor(() =>
      expect(screen.getByText(/CSV export failed/i)).toBeInTheDocument(),
    );
    expect(click).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
