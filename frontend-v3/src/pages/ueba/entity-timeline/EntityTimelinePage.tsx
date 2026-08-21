/**
 * EntityTimelinePage — UEBA entity timeline scatter chart.
 *
 * Renders an ECharts scatter chart through HaChart with:
 * - Time on the X axis
 * - Five Metric_Set names on the Y axis as categorical values
 * - Point symbolSize proportional to |z_score| (linear, min 4 px)
 * - Per-metric markArea baseline bands (mean ± 1 stddev)
 * - Colors resolved from CSS custom properties (no hex literals)
 * - Four distinguishable UI states: loading, empty, populated, error
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 7.6, 7.7
 */

import { useMemo } from 'react';

import type { EChartsOption, SeriesOption } from 'echarts';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaChart } from '@/components/ha-chart/HaChart';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { useEntityTimeline } from '@/hooks/useEntityTimeline';
import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import type {
  BaselineBand,
  EntityTimelinePoint,
  EntityTimelineResponse,
  MetricName,
} from '@/types/ueba.types';

/** The five Metric_Set names used as Y-axis categories. */
const METRIC_CATEGORIES: MetricName[] = [
  'logon_count_per_day',
  'unique_src_ips',
  'data_volume_bytes',
  'after_hours_logons',
  'failed_logon_ratio',
];

/** CSS tokens consumed by this chart. */
const CHART_TOKENS = [
  '--ha-text-secondary',
  '--ha-high',
  '--ha-critical',
] as const;

/** Minimum scatter point size in pixels. */
const MIN_SYMBOL_SIZE = 4;

/** Linear scale factor applied to |z_score| for symbol size. */
const SYMBOL_SCALE_FACTOR = 6;

export interface EntityTimelinePageProps {
  /** The user identifier whose timeline to display. */
  userId: string;
  /** Chart height in pixels. Defaults to 480. */
  height?: number;
}

/**
 * EntityTimelinePage component.
 *
 * Renders four distinguishable UI states:
 * 1. Initial load — skeleton overlay on the chart region
 * 2. Empty result — empty-state panel explaining no deviations found
 * 3. Populated result — full scatter + markArea chart
 * 4. Fetch error — error panel with retry action
 */
export function EntityTimelinePage({
  userId,
  height = 480,
}: EntityTimelinePageProps): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useEntityTimeline(userId);

  const tokens = useHaThemeTokens(CHART_TOKENS);

  const option = useMemo<EChartsOption>(
    () => buildChartOption(data, tokens),
    [data, tokens],
  );

  // State 1: Initial load — skeleton overlay
  if (isLoading) {
    return <LoadingState message="Loading entity timeline…" />;
  }

  // State 4: Fetch error — error panel with retry action
  if (isError) {
    return (
      <ErrorState
        title="Failed to load entity timeline"
        message={error?.message ?? 'An unexpected error occurred while loading the timeline.'}
        error={error ?? undefined}
        onRetry={() => { refetch(); }}
      />
    );
  }

  // State 2: Empty result — no deviations found
  if (!data || data.points.length === 0) {
    return (
      <EmptyState
        title="No deviations found"
        description="No behavioral deviations have been recorded for this user. The timeline will populate as the UEBA engine detects deviations from the baseline."
      />
    );
  }

  // State 3: Populated result — full scatter + markArea chart
  return (
    <HaChart
      option={option}
      height={height}
      ariaLabel="Entity timeline scatter chart"
      ariaDescription="Scatter chart showing behavioral metric deviations over time for the selected user"
    />
  );
}

/**
 * Compute the symbol size for a scatter point based on its z-score.
 * Linear scale with a minimum of MIN_SYMBOL_SIZE pixels.
 */
function computeSymbolSize(zScore: number): number {
  return Math.max(MIN_SYMBOL_SIZE, Math.abs(zScore) * SYMBOL_SCALE_FACTOR);
}

/**
 * Determine the color for a scatter point based on the severity of the z-score.
 * |z| > 4 → critical color; |z| > 3 → high color; otherwise → high color (default).
 */
function resolvePointColor(
  zScore: number,
  highColor: string,
  criticalColor: string,
): string {
  const absZ = Math.abs(zScore);
  if (absZ > 4) return criticalColor;
  if (absZ > 3) return highColor;
  return highColor;
}

/**
 * Build the ECharts option object for the entity timeline scatter chart.
 *
 * Colors are resolved from CSS custom properties at render time — never hex literals.
 * Mark areas represent baseline mean ± 1 stddev bands per metric.
 */
function buildChartOption(
  data: EntityTimelineResponse | undefined,
  tokens: Record<typeof CHART_TOKENS[number], string>,
): EChartsOption {
  const axisColor = tokens['--ha-text-secondary'];
  const highColor = tokens['--ha-high'];
  const criticalColor = tokens['--ha-critical'];

  const points = data?.points ?? [];
  const baselines = data?.baselines ?? [];

  // Build markArea data for each metric's baseline band
  const markAreaData = buildMarkAreaData(baselines, axisColor);

  const scatterSeries: SeriesOption = {
    type: 'scatter',
    data: points.map((p: EntityTimelinePoint) => ({
      value: [p.runTs, p.metricName],
      symbolSize: computeSymbolSize(p.zScore),
      itemStyle: {
        color: resolvePointColor(p.zScore, highColor, criticalColor),
      },
    })),
    markArea: {
      silent: true,
      data: markAreaData,
    },
  };

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { value: [string, string]; data: { symbolSize: number } };
        const point = points.find(
          (pt) => pt.runTs === p.value[0] && pt.metricName === p.value[1],
        );
        if (!point) return '';
        return [
          `<strong>${point.metricName}</strong>`,
          `Time: ${new Date(point.runTs).toLocaleString()}`,
          `Z-Score: ${point.zScore.toFixed(2)}`,
          `Points: ${point.points}`,
          `Observed: ${point.observed}`,
        ].join('<br/>');
      },
    },
    grid: {
      left: '15%',
      right: '5%',
      top: '8%',
      bottom: '12%',
      borderColor: axisColor,
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor },
      splitLine: { lineStyle: { color: axisColor, opacity: 0.15 } },
    },
    yAxis: {
      type: 'category',
      data: METRIC_CATEGORIES,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: axisColor },
      splitLine: { lineStyle: { color: axisColor, opacity: 0.15 } },
    },
    series: [scatterSeries],
  };
}

/**
 * Build markArea data pairs for each metric's baseline band.
 *
 * Each band is centered on the baseline mean and extends ± 1 stddev.
 * Band fill and border colors use the axis color with low opacity.
 */
function buildMarkAreaData(
  baselines: BaselineBand[],
  bandColor: string,
): Array<[{ yAxis: string; itemStyle: { color: string; opacity: number; borderColor: string } }, { yAxis: string }]> {
  return baselines.map((b: BaselineBand) => [
    {
      yAxis: b.metricName,
      itemStyle: {
        color: bandColor,
        opacity: 0.08,
        borderColor: bandColor,
      },
    },
    {
      yAxis: b.metricName,
    },
  ]);
}
