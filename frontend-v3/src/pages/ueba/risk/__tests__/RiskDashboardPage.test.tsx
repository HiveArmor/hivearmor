/**
 * Vitest component tests for RiskDashboardPage.
 *
 * Covers:
 * 1. Initial render of all four panels (bar chart, line chart, chips, table)
 * 2. `View Timeline` action opens View_Timeline_Drawer with the correct userId
 * 3. `Create Incident` action invokes the incident-creation flow with correct userId
 * 4. Bar chart, trend line, and chips resolve colors from --ha-* tokens
 *    (assert on computed style call values rather than hex literals)
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.7, 6.8
 */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { AnomalyCountsDTO, RiskTrendPointDTO, UserRiskDTO } from '@/types/ueba.types';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_RISK_SCORES: UserRiskDTO[] = [
  { userId: 'user-alpha', totalScore: 120, anomalyCount: 5, topMetric: 'failed_logon_ratio', lastUpdated: '2026-07-25T10:00:00Z' },
  { userId: 'user-beta', totalScore: 85, anomalyCount: 3, topMetric: 'after_hours_logons', lastUpdated: '2026-07-25T09:00:00Z' },
  { userId: 'user-gamma', totalScore: 40, anomalyCount: 1, topMetric: 'logon_count_per_day', lastUpdated: '2026-07-24T14:00:00Z' },
];

const MOCK_RISK_TREND: RiskTrendPointDTO[] = [
  { day: '2026-07-01', totalScore: 50 },
  { day: '2026-07-02', totalScore: 65 },
  { day: '2026-07-03', totalScore: 80 },
];

const MOCK_ANOMALY_COUNTS: AnomalyCountsDTO = {
  tier10: 12,
  tier25: 7,
  tier50: 3,
};

// ---------------------------------------------------------------------------
// Token values returned by the mocked useHaThemeTokens hook.
// These are NOT hex values — they represent the resolved CSS token values
// that would normally come from getComputedStyle.
// ---------------------------------------------------------------------------

const MOCK_TOKENS = {
  '--ha-high': 'token-ha-high',
  '--ha-medium': 'token-ha-medium',
  '--ha-critical': 'token-ha-critical',
  '--ha-primary': 'token-ha-primary',
  '--ha-text-secondary': 'token-ha-text-secondary',
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useHaThemeTokens', () => ({
  useHaThemeTokens: () => MOCK_TOKENS,
}));

vi.mock('@/hooks/useEntityTimeline', () => ({
  useEntityTimeline: () => ({
    data: { points: [], baselines: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock the UEBA service — TanStack Query hooks will use these
vi.mock('@/services/ueba.service', () => ({
  getRiskScores: vi.fn().mockResolvedValue(MOCK_RISK_SCORES),
  getRiskTrend: vi.fn().mockResolvedValue(MOCK_RISK_TREND),
  getAnomalyCounts: vi.fn().mockResolvedValue(MOCK_ANOMALY_COUNTS),
  getEntityTimeline: vi.fn().mockResolvedValue({ points: [], baselines: [] }),
}));

// Capture the chart option passed to HaChart
let capturedBarOption: unknown = null;
let capturedLineOption: unknown = null;

vi.mock('@/components/ha-chart/HaChart', () => ({
  HaChart: (props: { option: unknown; ariaLabel?: string; height?: number; loading?: boolean }) => {
    if (props.ariaLabel?.toLowerCase().includes('bar')) {
      capturedBarOption = props.option;
    } else if (props.ariaLabel?.toLowerCase().includes('trend')) {
      capturedLineOption = props.option;
    }
    return <div data-testid={`ha-chart`} aria-label={props.ariaLabel} />;
  },
}));

// Mock SiemDataGrid — render a simplified table with action buttons rendered
// through the column cell renderers
vi.mock('@/components/siem-data-grid/SiemDataGrid', () => ({
  SiemDataGrid: (props: {
    columnDefs: Array<{
      field?: string;
      headerName?: string;
      cellRenderer?: (params: { data: UserRiskDTO }) => React.ReactNode;
    }>;
    rowData: UserRiskDTO[];
    loading?: boolean;
    height?: number;
    rowHeight?: number;
    defaultColDef?: unknown;
    getRowId?: unknown;
  }) => {
    const actionsCol = props.columnDefs.find((col) => col.headerName === 'Actions');
    return (
      <div data-testid="siem-data-grid">
        {props.rowData.map((row) => (
          <div key={row.userId} data-testid={`grid-row-${row.userId}`}>
            <span>{row.userId}</span>
            <span>{row.totalScore}</span>
            {actionsCol?.cellRenderer &&
              actionsCol.cellRenderer({ data: row })}
          </div>
        ))}
      </div>
    );
  },
}));

// Mock HaDrawer — render children when open
vi.mock('@/components/ha-drawer/HaDrawer', () => ({
  HaDrawer: (props: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    width?: number;
    children: React.ReactNode;
  }) => {
    if (!props.isOpen) return null;
    return (
      <div data-testid="ha-drawer-content" data-subtitle={props.subtitle}>
        <button type="button" onClick={props.onClose} aria-label="Close drawer">
          Close
        </button>
        {props.children}
      </div>
    );
  },
}));

// Mock EntityTimelinePage to capture the userId prop
vi.mock('@/pages/ueba/entity-timeline/EntityTimelinePage', () => ({
  EntityTimelinePage: (props: { userId: string; height?: number }) => (
    <div data-testid="entity-timeline-page" data-user-id={props.userId}>
      EntityTimelinePage for {props.userId}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderPage() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RiskDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Lazy import after mocks
let RiskDashboardPage: React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RiskDashboardPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedBarOption = null;
    capturedLineOption = null;
    const mod = await import('../RiskDashboardPage');
    RiskDashboardPage = mod.RiskDashboardPage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Initial render — all four panels present
  // -------------------------------------------------------------------------
  describe('Initial render — all four panels', () => {
    it('renders the bar chart panel', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('risk-bar-chart-panel')).toBeInTheDocument();
      });
    });

    it('renders the risk trend panel', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('risk-trend-panel')).toBeInTheDocument();
      });
    });

    it('renders the anomaly chips panel', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('anomaly-chips-panel')).toBeInTheDocument();
      });
    });

    it('renders the user risk table panel', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('user-risk-table-panel')).toBeInTheDocument();
      });
    });

    it('renders HaChart for bar chart when data loads', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText(/bar chart/i)).toBeInTheDocument();
      });
    });

    it('renders HaChart for trend line when data loads', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByLabelText(/trend/i)).toBeInTheDocument();
      });
    });

    it('renders anomaly chips with correct tier counts', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('chip-tier10')).toBeInTheDocument();
        expect(screen.getByTestId('chip-tier25')).toBeInTheDocument();
        expect(screen.getByTestId('chip-tier50')).toBeInTheDocument();
      });
      // Verify the counts are displayed
      expect(screen.getByTestId('chip-tier10')).toHaveTextContent('12');
      expect(screen.getByTestId('chip-tier25')).toHaveTextContent('7');
      expect(screen.getByTestId('chip-tier50')).toHaveTextContent('3');
    });

    it('renders user risk table rows for all users', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('siem-data-grid')).toBeInTheDocument();
        expect(screen.getByTestId('grid-row-user-alpha')).toBeInTheDocument();
        expect(screen.getByTestId('grid-row-user-beta')).toBeInTheDocument();
        expect(screen.getByTestId('grid-row-user-gamma')).toBeInTheDocument();
      });
    });

    it('each table row has View Timeline and Create Incident buttons', async () => {
      renderPage();
      await waitFor(() => {
        const viewButtons = screen.getAllByRole('button', { name: /view timeline/i });
        const createButtons = screen.getAllByRole('button', { name: /create incident/i });
        expect(viewButtons).toHaveLength(MOCK_RISK_SCORES.length);
        expect(createButtons).toHaveLength(MOCK_RISK_SCORES.length);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. View Timeline action opens View_Timeline_Drawer with correct userId
  // -------------------------------------------------------------------------
  describe('View Timeline action', () => {
    it('opens View_Timeline_Drawer with the correct user identifier', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('grid-row-user-alpha')).toBeInTheDocument();
      });

      // Click "View Timeline" for user-alpha
      const viewButtons = screen.getAllByRole('button', { name: /view timeline/i });
      fireEvent.click(viewButtons[0]);

      // The drawer should appear and contain EntityTimelinePage scoped to user-alpha
      await waitFor(() => {
        const drawer = screen.getByTestId('view-timeline-drawer');
        expect(drawer).toBeInTheDocument();
      });

      const timeline = screen.getByTestId('entity-timeline-page');
      expect(timeline).toHaveAttribute('data-user-id', 'user-alpha');
    });

    it('passes the correct userId for user-beta', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('grid-row-user-beta')).toBeInTheDocument();
      });

      // Click "View Timeline" for user-beta (second row)
      const viewButtons = screen.getAllByRole('button', { name: /view timeline/i });
      fireEvent.click(viewButtons[1]);

      await waitFor(() => {
        const timeline = screen.getByTestId('entity-timeline-page');
        expect(timeline).toHaveAttribute('data-user-id', 'user-beta');
      });
    });

    it('drawer can be closed', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('grid-row-user-alpha')).toBeInTheDocument();
      });

      const viewButtons = screen.getAllByRole('button', { name: /view timeline/i });
      fireEvent.click(viewButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('view-timeline-drawer')).toBeInTheDocument();
      });

      // Close the drawer
      const closeButton = screen.getByRole('button', { name: /close drawer/i });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('view-timeline-drawer')).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Create Incident action — honest guidance (A2-UEBA-02)
  // -------------------------------------------------------------------------
  describe('Create Incident action', () => {
    it('opens evidence-collection guidance for user-alpha instead of a dead CustomEvent', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('grid-row-user-alpha')).toBeInTheDocument();
      });

      const createButtons = screen.getAllByRole('button', { name: /create incident/i });
      fireEvent.click(createButtons[0]);

      const dialog = await screen.findByTestId('ueba-create-incident-guidance');
      expect(dialog).toHaveAttribute('data-user-id', 'user-alpha');
      expect(screen.getByRole('link', { name: /open search & hunt/i })).toHaveAttribute(
        'href',
        '/search?q=user-alpha'
      );
    });

    it('opens evidence-collection guidance for user-beta', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('grid-row-user-beta')).toBeInTheDocument();
      });

      const createButtons = screen.getAllByRole('button', { name: /create incident/i });
      fireEvent.click(createButtons[1]);

      const dialog = await screen.findByTestId('ueba-create-incident-guidance');
      expect(dialog).toHaveAttribute('data-user-id', 'user-beta');
      expect(screen.getByRole('link', { name: /open search & hunt/i })).toHaveAttribute(
        'href',
        '/search?q=user-beta'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Colors resolved from --ha-* tokens (not hex literals)
  // -------------------------------------------------------------------------
  describe('Color resolution from CSS tokens', () => {
    it('bar chart uses --ha-high and --ha-medium for bar colors (no hex literals)', async () => {
      renderPage();

      await waitFor(() => {
        expect(capturedBarOption).not.toBeNull();
      });

      const option = capturedBarOption as {
        series: Array<{
          type: string;
          data: Array<{ value: number; itemStyle: { color: string } }>;
        }>;
      };

      // Verify bar colors are resolved token values, not hex
      for (const point of option.series[0].data) {
        expect(point.itemStyle.color).toMatch(/^token-ha-(high|medium)$/);
        // Ensure no hex literal was passed
        expect(point.itemStyle.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      }
    });

    it('trend line uses --ha-primary for line color (no hex literals)', async () => {
      renderPage();

      await waitFor(() => {
        expect(capturedLineOption).not.toBeNull();
      });

      const option = capturedLineOption as {
        series: Array<{
          type: string;
          lineStyle: { color: string };
          itemStyle: { color: string };
        }>;
      };

      const lineSeries = option.series[0];
      expect(lineSeries.lineStyle.color).toBe('token-ha-primary');
      expect(lineSeries.itemStyle.color).toBe('token-ha-primary');
      // No hex
      expect(lineSeries.lineStyle.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(lineSeries.itemStyle.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });

    it('bar chart axis uses --ha-text-secondary token for axis colors', async () => {
      renderPage();

      await waitFor(() => {
        expect(capturedBarOption).not.toBeNull();
      });

      const option = capturedBarOption as {
        xAxis: { axisLine: { lineStyle: { color: string } }; axisLabel: { color: string } };
        yAxis: { axisLine: { lineStyle: { color: string } }; axisLabel: { color: string } };
      };

      expect(option.xAxis.axisLine.lineStyle.color).toBe('token-ha-text-secondary');
      expect(option.xAxis.axisLabel.color).toBe('token-ha-text-secondary');
      expect(option.yAxis.axisLine.lineStyle.color).toBe('token-ha-text-secondary');
      expect(option.yAxis.axisLabel.color).toBe('token-ha-text-secondary');
    });

    it('anomaly chips use token-resolved colors (no hex literals)', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('chip-tier10')).toBeInTheDocument();
      });

      const chip10 = screen.getByTestId('chip-tier10');
      const chip25 = screen.getByTestId('chip-tier25');
      const chip50 = screen.getByTestId('chip-tier50');

      // The chips apply backgroundColor from the token values
      expect(chip10).toHaveStyle({ backgroundColor: 'token-ha-medium' });
      expect(chip25).toHaveStyle({ backgroundColor: 'token-ha-high' });
      expect(chip50).toHaveStyle({ backgroundColor: 'token-ha-critical' });
    });
  });
});
