/**
 * TimelineChart
 *
 * ECharts scatter chart for HiveArmor EDR events.
 *
 * X axis — time (event timestamp)
 * Y axis — category (eleven EdrEventType values in fixed declaration order)
 *
 * Each data point is coloured by severity:
 *   >= 90  → --ha-critical
 *   >= 70  → --ha-high
 *   >= 40  → --ha-medium
 *    < 40  → --ha-positive
 *
 * Colours are resolved at render time via useHaThemeTokens.
 * No var(--ha-*) strings are ever passed into ECharts option objects.
 *
 * The ECharts instance is disposed on unmount.
 */

import { useEffect, useRef, useMemo } from 'react';

import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import type { EdrEventDTO, EdrEventType } from '@/types/edr';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Y-axis categories in fixed declaration order, matching the EdrEventType
 * union definition in types/edr.ts.
 */
const EDR_EVENT_CATEGORIES: EdrEventType[] = [
  'process_start',
  'process_end',
  'network_connect',
  'network_listen',
  'file_create',
  'file_modify',
  'file_delete',
  'registry_set',
  'registry_delete',
  'user_logon',
  'user_logoff',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a 0-100 severity value to the corresponding --ha-* token key.
 */
function severityTokenKey(
  severity: number,
): '--ha-critical' | '--ha-high' | '--ha-medium' | '--ha-positive' {
  if (severity >= 90) return '--ha-critical';
  if (severity >= 70) return '--ha-high';
  if (severity >= 40) return '--ha-medium';
  return '--ha-positive';
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface TimelineChartProps {
  events: EdrEventDTO[];
  onEventClick: (event: EdrEventDTO) => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineChart({ events, onEventClick, isLoading = false }: TimelineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Resolve all colour tokens at render time — never pass var(--ha-*) into ECharts.
  const tokens = useHaThemeTokens([
    '--ha-critical',
    '--ha-high',
    '--ha-medium',
    '--ha-positive',
    '--ha-surface-primary',
    '--ha-border',
    '--ha-text-primary',
    '--ha-text-secondary',
  ] as const);

  // Build the ECharts option object from current events + resolved tokens.
  const option = useMemo<EChartsOption>(() => {
    // Map each EdrEventDTO to a scatter data point.
    // Series data format: [timestamp (ms), categoryIndex, eventIndex]
    // We keep the event index so we can retrieve the original DTO on click.
    const seriesData = events.map((ev, idx) => {
      const categoryIndex = EDR_EVENT_CATEGORIES.indexOf(ev.eventType);
      return {
        value: [new Date(ev.timestamp).getTime(), categoryIndex, idx] as [number, number, number],
        itemStyle: {
          color: tokens[severityTokenKey(ev.severity)],
        },
      };
    });

    return {
      backgroundColor: tokens['--ha-surface-primary'],
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { data: { value: [number, number, number] } };
          const ev = events[p.data.value[2]];
          if (!ev) return '';
          const time = new Date(ev.timestamp).toLocaleString();
          return `<strong>${ev.eventType}</strong><br/>${ev.processName} (PID ${ev.pid})<br/>Severity: ${ev.severity}<br/>${time}`;
        },
      },
      grid: {
        left: '140px',
        right: '24px',
        top: '16px',
        bottom: '48px',
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          color: tokens['--ha-text-secondary'],
        },
        axisLine: {
          lineStyle: { color: tokens['--ha-border'] },
        },
        splitLine: {
          lineStyle: { color: tokens['--ha-border'] },
        },
      },
      yAxis: {
        type: 'category',
        data: EDR_EVENT_CATEGORIES,
        axisLabel: {
          color: tokens['--ha-text-primary'],
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
        },
        axisLine: {
          lineStyle: { color: tokens['--ha-border'] },
        },
        splitLine: {
          lineStyle: { color: tokens['--ha-border'] },
        },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 8,
          data: seriesData,
        },
      ],
    };
  }, [events, tokens]);

  // Initialise / update ECharts, wire resize listener, and dispose on unmount.
  useEffect(() => {
    if (!containerRef.current || isLoading) return;

    // Initialise once; reuse the existing instance on subsequent renders.
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current);
    }

    const chart = chartRef.current;
    chart.setOption(option, { notMerge: true });

    // Forward click events to the parent via onEventClick.
    const handleClick = (params: echarts.ECElementEvent) => {
      if (params.componentType !== 'series') return;
      const rawValue = params.value as [number, number, number];
      const ev = events[rawValue[2]];
      if (ev) onEventClick(ev);
    };

    chart.on('click', handleClick);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      chart.off('click', handleClick);
      window.removeEventListener('resize', handleResize);
    };
  }, [option, isLoading, events, onEventClick]);

  // Dispose the ECharts instance when the component unmounts.
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Loading state — do not initialise an ECharts instance.
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading timeline chart"
        style={{
          height: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tokens['--ha-text-secondary'],
        }}
      >
        Loading…
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Empty state.
  // -------------------------------------------------------------------------
  if (events.length === 0) {
    return (
      <div
        style={{
          height: '300px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tokens['--ha-text-secondary'],
        }}
      >
        No events to display.
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Chart container.
  // -------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '300px' }}
      aria-label="EDR event timeline chart"
    />
  );
}

export default TimelineChart;
