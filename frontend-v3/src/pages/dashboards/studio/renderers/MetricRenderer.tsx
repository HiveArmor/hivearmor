/**
 * MetricRenderer — Single KPI value tile renderer for dashboard widgets
 * Session S33 — Dashboard Studio widget renderers (§8, DSH-03)
 */

import type React from 'react';

export interface MetricRendererProps {
  data: unknown;
  config: MetricWidgetConfig;
}

export interface MetricWidgetConfig {
  visualizationId: number;
  label?: string;
  showTrend: boolean;
}

export function MetricRenderer({ data, config }: MetricRendererProps): React.JSX.Element {
  const metricData = parseMetricData(data);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '16px',
      }}
    >
      {/* Metric label */}
      {(config.label || metricData.label) && (
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          {config.label || metricData.label}
        </div>
      )}

      {/* Metric value */}
      <div
        style={{
          fontSize: 'var(--ha-text-2xl)',
          fontWeight: 'var(--ha-weight-semibold)',
          color: 'var(--ha-text-primary)',
          fontVariantNumeric: 'tabular-nums',
          marginBottom: config.showTrend && metricData.trend !== undefined ? '8px' : '0',
        }}
      >
        {formatMetricValue(metricData.value)}
      </div>

      {/* Trend indicator */}
      {config.showTrend && metricData.trend !== undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--ha-text-sm)',
            color:
              metricData.trend > 0
                ? 'var(--ha-positive)'
                : metricData.trend < 0
                  ? 'var(--ha-critical)'
                  : 'var(--ha-text-secondary)',
          }}
        >
          {metricData.trend > 0 && <span>↑</span>}
          {metricData.trend < 0 && <span>↓</span>}
          <span>{Math.abs(metricData.trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

interface MetricData {
  value: number | string;
  label?: string;
  trend?: number;
}

function parseMetricData(data: unknown): MetricData {
  if (typeof data !== 'object' || data === null) {
    return { value: 0 };
  }

  const d = data as Record<string, unknown>;

  return {
    value: typeof d.value === 'number' || typeof d.value === 'string' ? d.value : 0,
    label: typeof d.label === 'string' ? d.label : undefined,
    trend: typeof d.trend === 'number' ? d.trend : undefined,
  };
}

function formatMetricValue(value: number | string): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return '0';

  // Format large numbers with K/M/B suffixes
  if (Math.abs(value) >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1) + 'B';
  }
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + 'M';
  }
  if (Math.abs(value) >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K';
  }
  return value.toLocaleString();
}
