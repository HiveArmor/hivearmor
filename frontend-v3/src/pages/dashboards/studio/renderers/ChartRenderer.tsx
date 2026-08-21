/**
 * ChartRenderer — ECharts visualization renderer for dashboard widgets
 * Session S33 — Dashboard Studio widget renderers (§8, DSH-03)
 */

import type React from 'react';

import type { EChartsOption } from 'echarts';

import { HaChart } from '@/components/ha-chart';

export interface ChartRendererProps {
  data: unknown;
  config: ChartWidgetConfig;
  height?: string | number;
}

export interface ChartWidgetConfig {
  visualizationId: number;
  chartType: 'line' | 'bar' | 'pie' | 'area';
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend: boolean;
}

export function ChartRenderer({ data, config, height = '100%' }: ChartRendererProps): React.JSX.Element {
  // Transform the backend data shape into ECharts option format
  const option = buildChartOption(data, config);

  return <HaChart option={option} height={height} ariaLabel="Dashboard widget chart" />;
}

/**
 * Transform visualization data into ECharts option
 * Data shape depends on visualization type — use type guards for safe access
 */
function buildChartOption(data: unknown, config: ChartWidgetConfig): EChartsOption {
  // Type guard for chart data structure
  if (!isChartData(data)) {
    return buildEmptyOption();
  }

  const { chartType, xAxisLabel, yAxisLabel, showLegend } = config;

  const baseOption: EChartsOption = {
    backgroundColor: 'transparent',
    textStyle: {
      fontFamily: 'var(--ha-font-ui)',
      color: 'var(--ha-text-primary)',
    },
    legend: showLegend
      ? {
          show: true,
          textStyle: {
            color: 'var(--ha-text-secondary)',
            fontSize: 12,
          },
          top: 10,
        }
      : { show: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--ha-surface-raised)',
      borderColor: 'var(--ha-border)',
      textStyle: {
        color: 'var(--ha-text-primary)',
        fontSize: 12,
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: showLegend ? '15%' : '10%',
      containLabel: true,
    },
  };

  if (chartType === 'pie') {
    const firstSeries = Array.isArray(data.series) && data.series.length > 0 ? data.series[0] : null;
    return {
      ...baseOption,
      series: [
        {
          type: 'pie',
          data: (firstSeries && Array.isArray(firstSeries.data) ? firstSeries.data : []) as number[],
          radius: '60%',
          label: {
            color: 'var(--ha-text-primary)',
            fontSize: 12,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'var(--ha-scrim)',
            },
          },
        },
      ],
    };
  }

  // Line, Bar, Area charts
  return {
    ...baseOption,
    xAxis: {
      type: 'category',
      data: data.xAxis || [],
      name: xAxisLabel || '',
      nameTextStyle: {
        color: 'var(--ha-text-secondary)',
        fontSize: 12,
      },
      axisLine: {
        lineStyle: {
          color: 'var(--ha-border)',
        },
      },
      axisLabel: {
        color: 'var(--ha-text-secondary)',
        fontSize: 11,
      },
    },
    yAxis: {
      type: 'value',
      name: yAxisLabel || '',
      nameTextStyle: {
        color: 'var(--ha-text-secondary)',
        fontSize: 12,
      },
      axisLine: {
        lineStyle: {
          color: 'var(--ha-border)',
        },
      },
      axisLabel: {
        color: 'var(--ha-text-secondary)',
        fontSize: 11,
      },
      splitLine: {
        lineStyle: {
          color: 'var(--ha-border)',
          opacity: 0.3,
        },
      },
    },
    series: (Array.isArray(data.series) ? data.series : []).map((s: SeriesData) => ({
      name: s.name,
      type: chartType === 'area' ? 'line' : chartType,
      data: s.data,
      smooth: chartType === 'line' || chartType === 'area',
      areaStyle: chartType === 'area' ? {} : undefined,
      itemStyle: {
        color: s.color || undefined,
      },
    })),
  };
}

function buildEmptyOption(): EChartsOption {
  return {
    backgroundColor: 'transparent',
    title: {
      text: 'No data available',
      left: 'center',
      top: 'center',
      textStyle: {
        color: 'var(--ha-text-secondary)',
        fontSize: 13,
        fontWeight: 'normal',
      },
    },
  };
}

interface SeriesData {
  name: string;
  data: number[];
  color?: string;
}

interface ChartDataShape {
  xAxis?: string[];
  series?: SeriesData[];
}

function isChartData(data: unknown): data is ChartDataShape {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.series) || Array.isArray(d.xAxis);
}
