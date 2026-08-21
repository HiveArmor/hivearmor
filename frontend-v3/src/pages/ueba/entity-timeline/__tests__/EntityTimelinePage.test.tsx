/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Vitest component tests for EntityTimelinePage.
 *
 * Covers the four UI states (loading, empty, populated, error) and verifies
 * that markArea is present per metric row and that scatter symbolSize scales
 * with |z_score|.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.7
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { EntityTimelineResponse } from '@/types/ueba.types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefetch = vi.fn();

const mockUseEntityTimeline = vi.fn();
vi.mock('@/hooks/useEntityTimeline', () => ({
  useEntityTimeline: (...args: unknown[]) => mockUseEntityTimeline(...args),
}));

vi.mock('@/hooks/useHaThemeTokens', () => ({
  useHaThemeTokens: () => ({
    '--ha-text-secondary': '#97A6B8',
    '--ha-high': '#FFAA45',
    '--ha-critical': '#FF5D6C',
  }),
}));

// Mock HaChart to capture the option prop for assertion
let capturedOption: unknown = null;
vi.mock('@/components/ha-chart/HaChart', () => ({
  HaChart: (props: { option: unknown; ariaLabel?: string }) => {
    capturedOption = props.option;
    return <div data-testid="ha-chart" aria-label={props.ariaLabel} />;
  },
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POPULATED_DATA: EntityTimelineResponse = {
  points: [
    {
      metricName: 'logon_count_per_day',
      runTs: '2026-07-25T10:00:00Z',
      zScore: 3.5,
      points: 25,
      observed: 42,
    },
    {
      metricName: 'unique_src_ips',
      runTs: '2026-07-25T11:00:00Z',
      zScore: -4.2,
      points: 50,
      observed: 18,
    },
    {
      metricName: 'data_volume_bytes',
      runTs: '2026-07-25T12:00:00Z',
      zScore: 2.1,
      points: 10,
      observed: 500000,
    },
    {
      metricName: 'after_hours_logons',
      runTs: '2026-07-25T13:00:00Z',
      zScore: -2.5,
      points: 10,
      observed: 5,
    },
    {
      metricName: 'failed_logon_ratio',
      runTs: '2026-07-25T14:00:00Z',
      zScore: 5.0,
      points: 50,
      observed: 0.8,
    },
  ],
  baselines: [
    { metricName: 'logon_count_per_day', mean: 10, stddev: 3 },
    { metricName: 'unique_src_ips', mean: 5, stddev: 2 },
    { metricName: 'data_volume_bytes', mean: 100000, stddev: 20000 },
    { metricName: 'after_hours_logons', mean: 1, stddev: 0.5 },
    { metricName: 'failed_logon_ratio', mean: 0.05, stddev: 0.02 },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityTimelinePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOption = null;
  });

  // We import the component lazily after mocks are set up
  async function renderPage() {
    const { EntityTimelinePage } = await import('../EntityTimelinePage');
    return render(<EntityTimelinePage userId="user-001" />);
  }

  // -------------------------------------------------------------------------
  // State 1: Loading state
  // -------------------------------------------------------------------------
  describe('Loading state', () => {
    it('renders LoadingState when isLoading is true', async () => {
      mockUseEntityTimeline.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: mockRefetch,
      });

      await renderPage();

      const loadingEl = screen.getByText('Loading entity timeline…');
      expect(loadingEl).toBeInTheDocument();
      // HaChart should NOT be rendered in loading state
      expect(screen.queryByTestId('ha-chart')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // State 2: Empty state
  // -------------------------------------------------------------------------
  describe('Empty state', () => {
    it('renders EmptyState with "No deviations found" when data has empty points', async () => {
      mockUseEntityTimeline.mockReturnValue({
        data: { points: [], baselines: [] },
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      });

      await renderPage();

      expect(screen.getByText('No deviations found')).toBeInTheDocument();
      expect(screen.queryByTestId('ha-chart')).not.toBeInTheDocument();
    });

    it('renders EmptyState when data is undefined', async () => {
      mockUseEntityTimeline.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      });

      await renderPage();

      expect(screen.getByText('No deviations found')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // State 3: Populated state
  // -------------------------------------------------------------------------
  describe('Populated state', () => {
    it('renders HaChart when data has points', async () => {
      mockUseEntityTimeline.mockReturnValue({
        data: POPULATED_DATA,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      });

      await renderPage();

      expect(screen.getByTestId('ha-chart')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // State 4: Error state
  // -------------------------------------------------------------------------
  describe('Error state', () => {
    it('renders ErrorState with retry action when isError is true', async () => {
      mockUseEntityTimeline.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });

      await renderPage();

      // ErrorState renders with role="alert"
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
      // Retry button should be present
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      // HaChart should NOT be rendered
      expect(screen.queryByTestId('ha-chart')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Chart option assertions: markArea and symbolSize
  // -------------------------------------------------------------------------
  describe('Chart option — markArea and symbolSize', () => {
    beforeEach(() => {
      mockUseEntityTimeline.mockReturnValue({
        data: POPULATED_DATA,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      });
    });

    it('includes markArea data in the scatter series for each baseline metric', async () => {
      await renderPage();

      expect(capturedOption).not.toBeNull();
      const option = capturedOption as {
        series: Array<{
          type: string;
          markArea?: { data: Array<[{ yAxis: string }, { yAxis: string }]> };
        }>;
      };

      // There should be at least one series (the scatter series)
      expect(option.series.length).toBeGreaterThanOrEqual(1);

      const scatterSeries = option.series.find((s) => s.type === 'scatter');
      expect(scatterSeries).toBeDefined();
      expect(scatterSeries!.markArea).toBeDefined();
      expect(scatterSeries!.markArea!.data).toBeDefined();

      // One markArea entry per baseline metric
      const markAreaData = scatterSeries!.markArea!.data;
      expect(markAreaData).toHaveLength(POPULATED_DATA.baselines.length);

      // Each markArea pair has a yAxis matching a metric name
      const markAreaMetrics = markAreaData.map(
        (pair: [{ yAxis: string }, { yAxis: string }]) => pair[0].yAxis,
      );
      for (const baseline of POPULATED_DATA.baselines) {
        expect(markAreaMetrics).toContain(baseline.metricName);
      }
    });

    it('scales scatter symbolSize proportional to |z_score| with minimum of 4', async () => {
      await renderPage();

      expect(capturedOption).not.toBeNull();
      const option = capturedOption as {
        series: Array<{
          type: string;
          data: Array<{ value: [string, string]; symbolSize: number }>;
        }>;
      };

      const scatterSeries = option.series.find((s) => s.type === 'scatter');
      expect(scatterSeries).toBeDefined();
      expect(scatterSeries!.data.length).toBe(POPULATED_DATA.points.length);

      const MIN_SYMBOL_SIZE = 4;
      const SYMBOL_SCALE_FACTOR = 6;

      for (let i = 0; i < POPULATED_DATA.points.length; i++) {
        const point = POPULATED_DATA.points[i];
        const chartPoint = scatterSeries!.data[i];
        const expectedSize = Math.max(
          MIN_SYMBOL_SIZE,
          Math.abs(point.zScore) * SYMBOL_SCALE_FACTOR,
        );
        expect(chartPoint.symbolSize).toBe(expectedSize);
      }
    });

    it('symbolSize is never less than 4 pixels regardless of z_score', async () => {
      // Use data with a very small z-score
      const smallZData: EntityTimelineResponse = {
        points: [
          {
            metricName: 'logon_count_per_day',
            runTs: '2026-07-25T10:00:00Z',
            zScore: 0.1,
            points: 0,
            observed: 10.3,
          },
        ],
        baselines: [{ metricName: 'logon_count_per_day', mean: 10, stddev: 3 }],
      };

      mockUseEntityTimeline.mockReturnValue({
        data: smallZData,
        isLoading: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      });

      await renderPage();

      const option = capturedOption as {
        series: Array<{
          type: string;
          data: Array<{ symbolSize: number }>;
        }>;
      };
      const scatterSeries = option.series.find((s) => s.type === 'scatter');
      expect(scatterSeries!.data[0].symbolSize).toBeGreaterThanOrEqual(4);
    });

    it('larger |z_score| produces larger symbolSize', async () => {
      await renderPage();

      const option = capturedOption as {
        series: Array<{
          type: string;
          data: Array<{ symbolSize: number }>;
        }>;
      };
      const scatterSeries = option.series.find((s) => s.type === 'scatter');

      // Point with z=5.0 should be larger than point with z=2.1
      const largeZPoint = scatterSeries!.data[4]; // z=5.0
      const smallZPoint = scatterSeries!.data[2]; // z=2.1
      expect(largeZPoint.symbolSize).toBeGreaterThan(smallZPoint.symbolSize);
    });
  });
});
