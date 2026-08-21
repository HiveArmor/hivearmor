/**
 * EPS Trend Chart Component
 * Displays rolling 60-second events-per-second history from the live SSE stream.
 */

import type { EChartsOption } from 'echarts';

import { HaChart } from '@/components/ha-chart/HaChart';
import { useHaThemeTokens, withHaAlpha } from '@/hooks/useHaThemeTokens';

const EPS_CHART_TOKENS = [
  '--ha-primary',
  '--ha-text-secondary',
  '--ha-border',
  '--ha-surface-raised',
  '--ha-text-primary',
] as const;

export interface TrendBucket {
  timestamp: string;
  count: number;
}

export interface EpsChartProps {
  loading?: boolean;
  data?: TrendBucket[];
  currentEps?: number;
}

export function EpsChart({ loading, data, currentEps }: EpsChartProps): JSX.Element {
  const hasData = !loading && data && data.length > 0;
  const tokens = useHaThemeTokens(EPS_CHART_TOKENS);
  const primary = tokens['--ha-primary'];
  const textSecondary = tokens['--ha-text-secondary'];
  const border = tokens['--ha-border'];
  const surfaceRaised = tokens['--ha-surface-raised'];
  const textPrimary = tokens['--ha-text-primary'];
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const option: EChartsOption = {
    animation: !prefersReducedMotion,
    backgroundColor: 'transparent',
    grid: { top: 12, right: 16, bottom: 32, left: 48, containLabel: false },
    xAxis: {
      type: 'category',
      data: (data ?? []).map((b) => {
        const date = new Date(b.timestamp);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      }),
      axisLabel: { color: textSecondary, fontSize: 11 },
      axisLine: { lineStyle: { color: border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      axisLabel: { color: textSecondary, fontSize: 11 },
      splitLine: { lineStyle: { color: border, type: 'dashed' } },
    },
    series: [
      {
        name: 'Events/sec',
        type: 'line',
        data: (data ?? []).map((b) => b.count),
        smooth: true,
        lineStyle: { color: primary, width: 2 },
        itemStyle: { color: primary },
        showSymbol: false,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: withHaAlpha(primary, 0.16) },
              { offset: 1, color: withHaAlpha(primary, 0) },
            ],
          },
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: surfaceRaised,
      borderColor: border,
      textStyle: { color: textPrimary, fontSize: 12 },
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number }[];
        if (!p || !p[0]) return '';
        return `${p[0].name}<br/><b>${p[0].value} eps</b>`;
      },
    },
  };

  return (
    <div
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        height: '220px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Events / Second — Last 60s
        </span>
        {currentEps !== undefined && (
          <span
            style={{
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-base)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--ha-primary)',
              fontWeight: 600,
            }}
          >
            {currentEps} eps
          </span>
        )}
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '80%',
              height: '60%',
              background:
                'linear-gradient(90deg, var(--ha-surface-raised) 25%, var(--ha-border) 50%, var(--ha-surface-raised) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
              borderRadius: 'var(--ha-radius-base)',
            }}
          />
        </div>
      ) : !hasData ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              background: 'color-mix(in srgb, var(--ha-high) 8%, transparent)',
              border: '1px solid var(--ha-high)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-high)',
              textAlign: 'center',
            }}
          >
            Waiting for live EPS data — stream connecting…
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: '8px 0' }}>
          <HaChart
            option={option}
            style={{ height: '100%', width: '100%' }}
            ariaLabel="Events per second — rolling 60-second history"
          />
        </div>
      )}
    </div>
  );
}
