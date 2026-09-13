/**
 * AgentVitalsSparkline.tsx — compact trend line for a single vitals signal
 * (CPU / EPS / queue depth), SPEC-02 (W2).
 *
 * Modeled on `EpsSparkline`: wraps the design-system `HaChart` (ECharts) and
 * reads its line colour from a CSS custom property via `getComputedStyle`, so
 * no hex literal appears here and theme switches are reflected without reload.
 * The colour is keyed to the health level of the newest sample so a degraded
 * CPU trend reads red, an at-risk one amber, and a healthy one uses the
 * neutral product accent.
 */

import { useMemo } from 'react';

import { HaChart } from '../ha-chart/HaChart';

import type { HealthLevel } from '@/services/agentHealth';

/** Maps a health level to the design token whose value colours the line. */
const LEVEL_TOKEN: Record<HealthLevel, string> = {
  red: '--ha-severity-critical',
  amber: '--ha-severity-high',
  green: '--ha-action-primary',
  unknown: '--ha-state-disconnected',
};

function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

export interface AgentVitalsSparklineProps {
  /** Chronological (oldest→newest) numeric series to plot. */
  series: number[];
  /** Health level of the newest sample — drives the line colour. */
  level?: HealthLevel;
  height?: number;
  ariaLabel?: string;
}

/**
 * Renders a compact area line of a vitals signal. Empty series render nothing
 * (the caller shows the honest "no data" affordance instead of a flat line).
 */
export function AgentVitalsSparkline({
  series,
  level = 'green',
  height = 28,
  ariaLabel = 'Vitals trend',
}: AgentVitalsSparklineProps): JSX.Element | null {
  const color = useMemo(() => readToken(LEVEL_TOKEN[level]), [level]);

  if (series.length === 0) return null;

  return (
    <HaChart
      option={{
        grid: { top: 2, right: 2, bottom: 2, left: 2 },
        xAxis: { type: 'category', show: false, data: series.map((_, i) => i) },
        yAxis: { type: 'value', show: false, min: 0 },
        series: [
          {
            type: 'line',
            data: series,
            smooth: true,
            symbol: 'none',
            lineStyle: { color, width: 1.5 },
            itemStyle: { color },
            areaStyle: { color, opacity: 0.14 },
          },
        ],
        tooltip: { show: false },
      }}
      height={height}
      width="100%"
      ariaLabel={ariaLabel}
    />
  );
}
