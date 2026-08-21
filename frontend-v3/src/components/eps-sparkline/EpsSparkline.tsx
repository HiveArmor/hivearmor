/**
 * EpsSparkline.tsx — Rolling EPS (events-per-second) sparkline chart.
 *
 * Reads its line color exclusively from the `--ha-primary` CSS custom property
 * via `getComputedStyle`; no hex literals appear in this file.
 *
 * Wraps ECharts through the project's `HaChart` wrapper component.
 *
 * Requirements: 10.2, 10.3, 13.9
 */

import { useMemo } from 'react';

import { HaChart } from '../ha-chart/HaChart';

// ---------------------------------------------------------------------------
// Color helper — reads the design token at render time so that theme switches
// are reflected without a page reload.
// ---------------------------------------------------------------------------

/**
 * Returns the current value of the `--ha-primary` CSS custom property by
 * reading it from the document root's computed style.
 *
 * No hex literal is used here; the color comes entirely from the design token.
 */
const readPrimary = (): string =>
  getComputedStyle(document.documentElement)
    .getPropertyValue('--ha-primary')
    .trim();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface EpsSparklineProps {
  /** Ordered array of EPS samples to render. Values must be ≥ 0. */
  series: number[];
  /** Optional accessible label for screen readers. */
  ariaLabel?: string;
}

/**
 * `EpsSparkline` renders a compact line chart of rolling EPS samples.
 *
 * - Line color is sourced from `--ha-primary` (never a hex literal).
 * - The chart is wrapped in `HaChart` per the HiveArmor design system.
 * - `useMemo` with an empty dependency array reads the color once per mount;
 *   the chart is cheap so full re-reads on every render are not needed.
 */
export function EpsSparkline({
  series,
  ariaLabel = 'Events per second sparkline',
}: EpsSparklineProps): JSX.Element {
  // Read the design token once per mount. No hex literal anywhere in this file.
  const color = useMemo(readPrimary, []);

  return (
    <HaChart
      option={{
        grid: { top: 2, right: 2, bottom: 2, left: 2 },
        xAxis: {
          type: 'category',
          show: false,
          data: series.map((_, i) => i),
        },
        yAxis: {
          type: 'value',
          show: false,
        },
        series: [
          {
            type: 'line',
            data: series,
            smooth: true,
            symbol: 'none',
            lineStyle: { color, width: 2 },
            itemStyle: { color },
            areaStyle: { color, opacity: 0.15 },
          },
        ],
        tooltip: { show: false },
      }}
      height={40}
      width="100%"
      ariaLabel={ariaLabel}
    />
  );
}
