/**
 * TimelineTabContent — ECharts scatter chart for the Search & Hunt Timeline tab.
 *
 * Renders up to 500 TimelineEventDTO events as scatter points keyed by timestamp (x-axis)
 * and eventType (y-axis category). Point colour is resolved from --ha-* design tokens at
 * render time via getComputedStyle — zero hex literals.
 *
 * Non-happy states:
 *   isLoading                   → LoadingState  (skeleton rows)
 *   isError                     → ErrorState    (error message)
 *   events.length === 0 && !isLoading → EmptyState (no events message)
 */

import { useMemo } from 'react';

import type { EChartsOption } from 'echarts';
import { Activity } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaChart } from '@/components/ha-chart';
import { LoadingState } from '@/components/loading-state';
import type { TimelineEventDTO } from '@/types/search';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineTabContentProps {
  events: TimelineEventDTO[];
  isLoading: boolean;
  isError: boolean;
  onEventClick: (e: TimelineEventDTO) => void;
}

// ECharts scatter point: [timestamp-ms, eventType-index, raw DTO reference]
interface ScatterPoint {
  value: [number, number];
  _raw: TimelineEventDTO;
}

// Typed subset of the ECharts scatter click params that ReactECharts delivers
interface EChartsClickParams {
  data: ScatterPoint;
}

// ---------------------------------------------------------------------------
// Token resolver — called once per render to read computed CSS custom properties
// ---------------------------------------------------------------------------

function resolveToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function severityToColor(severity: number | null): string {
  if (severity === null) return resolveToken('--ha-medium');
  if (severity >= 4) return resolveToken('--ha-critical');
  if (severity === 3) return resolveToken('--ha-high');
  if (severity === 2) return resolveToken('--ha-medium');
  // severity <= 1
  return resolveToken('--ha-positive');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineTabContent({
  events,
  isLoading,
  isError,
  onEventClick,
}: TimelineTabContentProps): JSX.Element {
  // --- Non-happy states ---

  if (isLoading) {
    return <LoadingState message="Loading timeline events…" rows={4} />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load timeline"
        message="Unable to fetch timeline events. Check your connection or try adjusting the time range."
      />
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={48} />}
        title="No timeline events"
        description="No events match the current query and time range. Try broadening the search."
      />
    );
  }

  // --- Happy path: scatter chart ---
  return <TimelineChart events={events} onEventClick={onEventClick} />;
}

// ---------------------------------------------------------------------------
// Inner chart — extracted so hooks only run when events are present
// ---------------------------------------------------------------------------

interface TimelineChartProps {
  events: TimelineEventDTO[];
  onEventClick: (e: TimelineEventDTO) => void;
}

function TimelineChart({ events, onEventClick }: TimelineChartProps): JSX.Element {
  // Resolve tokens once during render (stable across a single paint)
  const colorBorder = resolveToken('--ha-border');
  const colorTextSecondary = resolveToken('--ha-text-secondary');
  const colorSurface = resolveToken('--ha-surface-primary');
  const colorTextPrimary = resolveToken('--ha-text-primary');

  // Derive the sorted unique event types for the y-axis categories
  const eventTypes = useMemo<string[]>(() => {
    const seen = new Set<string>();
    events.forEach((e) => seen.add(e.eventType));
    return Array.from(seen).sort();
  }, [events]);

  // Build the scatter series data
  const seriesData = useMemo<ScatterPoint[]>(
    () =>
      events.map((event) => ({
        value: [new Date(event.timestamp).getTime(), eventTypes.indexOf(event.eventType)],
        _raw: event,
        // Per-point colour resolved from the design token
        itemStyle: { color: severityToColor(event.severity) },
      })),
    [events, eventTypes]
  );

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      grid: { top: 24, right: 20, bottom: 56, left: 160, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: colorSurface,
        borderColor: colorBorder,
        textStyle: { color: colorTextPrimary, fontSize: 11 },
        formatter: (params: unknown) => {
          const p = params as { data: ScatterPoint };
          const dto = p.data._raw;
          const ts = new Date(dto.timestamp).toLocaleString();
          return `
            <strong>${dto.eventType}</strong><br/>
            ${ts}<br/>
            DataType: ${dto.dataType}<br/>
            Severity: ${dto.severity ?? '—'}
          `;
        },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: colorBorder } },
        axisLabel: { color: colorTextSecondary, fontSize: 10 },
        splitLine: { lineStyle: { color: colorBorder, type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: eventTypes,
        axisLine: { lineStyle: { color: colorBorder } },
        axisLabel: { color: colorTextSecondary, fontSize: 10, width: 150, overflow: 'truncate' },
        splitLine: { lineStyle: { color: colorBorder, type: 'dashed' } },
      },
      series: [
        {
          type: 'scatter',
          data: seriesData,
          symbolSize: 8,
          emphasis: {
            itemStyle: {
              borderColor: colorTextPrimary,
              borderWidth: 2,
            },
          },
        },
      ],
    }),
    [colorBorder, colorSurface, colorTextPrimary, colorTextSecondary, eventTypes, seriesData]
  );

  const handleChartClick = useMemo(
    () => (params: unknown) => {
      const p = params as EChartsClickParams;
      if (p?.data?._raw) {
        onEventClick(p.data._raw);
      }
    },
    [onEventClick]
  );

  return (
    <div
      style={{
        width: '100%',
        height: '400px',
        background: 'var(--ha-surface-primary)',
        borderRadius: 'var(--ha-radius-base)',
        border: '1px solid var(--ha-border)',
        padding: 'var(--ha-space-4)',
        boxSizing: 'border-box',
      }}
    >
      <HaChart
        option={option}
        height="100%"
        width="100%"
        onChartClick={handleChartClick}
        ariaLabel="Timeline scatter chart: events by type over time"
        ariaDescription="Each point represents a security event. Point colour indicates severity: red for critical, amber for high, blue for medium, green for low."
      />
    </div>
  );
}
