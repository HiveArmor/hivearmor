/**
 * Pure function that maps ChartType + ChartData + metrics + buckets to EChartsOption.
 * Returns null for chart types that use custom React rendering (Metric, Table, List, Text, Region Map, Tag Cloud).
 */

import type { EChartsOption } from "echarts";

import {
  ChartType,
  type ChartData,
  type ChartSeries,
  type MetricAggregation,
  type BucketAggregation,
} from "@/types/visualization-builder";

import { DARK_CHART_THEME } from "@/lib/chart-theme";

// Chart types that are rendered with custom React components (not ECharts)
const CUSTOM_RENDER_TYPES: Set<ChartType> = new Set([
  ChartType.METRIC,
  ChartType.TABLE,
  ChartType.LIST,
  ChartType.TEXT,
  ChartType.REGION_MAP,
  ChartType.TAG_CLOUD,
]);

/**
 * Builds an EChartsOption from visualization configuration.
 * Returns null for chart types that require custom React rendering.
 */
export function buildChartOptions(
  chartType: ChartType,
  data: ChartData,
  metrics: MetricAggregation[],
  buckets: BucketAggregation[]
): EChartsOption | null {
  if (CUSTOM_RENDER_TYPES.has(chartType)) {
    return null;
  }

  // Guard against empty/invalid data
  if (!data || !data.series || data.series.length === 0) {
    return buildEmptyState();
  }

  switch (chartType) {
    case ChartType.LINE:
      return buildLineOptions(data, metrics, buckets);
    case ChartType.AREA:
      return buildAreaOptions(data, metrics, buckets);
    case ChartType.BAR:
      return buildBarOptions(data, metrics, buckets);
    case ChartType.BAR_HORIZONTAL:
      return buildBarHorizontalOptions(data, metrics, buckets);
    case ChartType.PIE:
      return buildPieOptions(data, metrics);
    case ChartType.GAUGE:
      return buildGaugeOptions(data, metrics);
    case ChartType.GOAL:
      return buildGoalOptions(data, metrics);
    case ChartType.HEAT_MAP:
      return buildHeatMapOptions(data, metrics, buckets);
    default:
      return null;
  }
}

// ─── Internal Builders ───────────────────────────────────────────────────────

function buildEmptyState(): EChartsOption {
  return {
    title: {
      text: "No data available",
      left: "center",
      top: "center",
      textStyle: {
        color: "#64748B",
        fontSize: 14,
        fontWeight: "normal",
      },
    },
  };
}

function buildLineOptions(
  data: ChartData,
  _metrics?: MetricAggregation[],
  _buckets?: BucketAggregation[]
): EChartsOption {
  void _metrics; void _buckets;
  return {
    tooltip: {
      trigger: "axis",
      ...DARK_CHART_THEME.tooltip,
    },
    legend: buildLegend(data.series),
    grid: DARK_CHART_THEME.grid,
    xAxis: {
      type: "category",
      data: data.categories ?? [],
      ...DARK_CHART_THEME.categoryAxis,
    },
    yAxis: {
      type: "value",
      ...DARK_CHART_THEME.valueAxis,
    },
    series: data.series.map((s, idx) => ({
      name: s.name,
      type: "line" as const,
      data: extractNumericData(s),
      smooth: false,
      symbol: "circle",
      symbolSize: 4,
      lineStyle: { width: 2 },
      itemStyle: { color: getColor(idx) },
    })),
  };
}

function buildAreaOptions(
  data: ChartData,
  _metrics?: MetricAggregation[],
  _buckets?: BucketAggregation[]
): EChartsOption {
  void _metrics; void _buckets;
  return {
    tooltip: {
      trigger: "axis",
      ...DARK_CHART_THEME.tooltip,
    },
    legend: buildLegend(data.series),
    grid: DARK_CHART_THEME.grid,
    xAxis: {
      type: "category",
      data: data.categories ?? [],
      ...DARK_CHART_THEME.categoryAxis,
    },
    yAxis: {
      type: "value",
      ...DARK_CHART_THEME.valueAxis,
    },
    series: data.series.map((s, idx) => ({
      name: s.name,
      type: "line" as const,
      data: extractNumericData(s),
      smooth: false,
      symbol: "circle",
      symbolSize: 4,
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.15 },
      itemStyle: { color: getColor(idx) },
    })),
  };
}

function buildBarOptions(
  data: ChartData,
  _metrics?: MetricAggregation[],
  _buckets?: BucketAggregation[]
): EChartsOption {
  void _metrics; void _buckets;
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...DARK_CHART_THEME.tooltip,
    },
    legend: buildLegend(data.series),
    grid: DARK_CHART_THEME.grid,
    xAxis: {
      type: "category",
      data: data.categories ?? [],
      ...DARK_CHART_THEME.categoryAxis,
    },
    yAxis: {
      type: "value",
      ...DARK_CHART_THEME.valueAxis,
    },
    series: data.series.map((s, idx) => ({
      name: s.name,
      type: "bar" as const,
      data: extractNumericData(s),
      barMaxWidth: 40,
      itemStyle: {
        color: getColor(idx),
        borderRadius: [2, 2, 0, 0],
      },
    })),
  };
}

function buildBarHorizontalOptions(
  data: ChartData,
  _metrics?: MetricAggregation[],
  _buckets?: BucketAggregation[]
): EChartsOption {
  void _metrics; void _buckets;
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...DARK_CHART_THEME.tooltip,
    },
    legend: buildLegend(data.series),
    grid: DARK_CHART_THEME.grid,
    xAxis: {
      type: "value",
      ...DARK_CHART_THEME.valueAxis,
    },
    yAxis: {
      type: "category",
      data: data.categories ?? [],
      ...DARK_CHART_THEME.categoryAxis,
    },
    series: data.series.map((s, idx) => ({
      name: s.name,
      type: "bar" as const,
      data: extractNumericData(s),
      barMaxWidth: 40,
      itemStyle: {
        color: getColor(idx),
        borderRadius: [0, 2, 2, 0],
      },
    })),
  };
}

function buildPieOptions(
  data: ChartData,
  _metrics?: MetricAggregation[]
): EChartsOption {
  void _metrics;
  // For pie charts, use the first series' data as name/value pairs
  const series = data.series[0];
  const pieData = series.data.map((item, idx) => {
    if (typeof item === "object" && item !== null) {
      return { name: item.name, value: item.value };
    }
    // Fall back to category names if available
    const name = data.categories?.[idx] ?? `Item ${idx + 1}`;
    return { name, value: item as number };
  });

  return {
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
      ...DARK_CHART_THEME.tooltip,
    },
    legend: {
      orient: "vertical",
      right: "5%",
      top: "center",
      textStyle: { color: "#94A3B8" },
      inactiveColor: "#475569",
    },
    series: [
      {
        type: "pie" as const,
        radius: ["40%", "70%"],
        center: ["40%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "transparent",
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
            color: "#E2E8F0",
          },
        },
        labelLine: { show: false },
        data: pieData,
      },
    ],
  };
}

function buildGaugeOptions(
  data: ChartData,
  metrics: MetricAggregation[]
): EChartsOption {
  // Gauge uses the first value from the first series
  const value = extractFirstValue(data);
  const label = metrics[0]?.label ?? "Value";

  return {
    tooltip: {
      ...DARK_CHART_THEME.tooltip,
    },
    series: [
      {
        type: "gauge" as const,
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: computeGaugeMax(value),
        progress: {
          show: true,
          width: 18,
          itemStyle: {
            color: "#3B82F6",
          },
        },
        axisLine: {
          lineStyle: {
            width: 18,
            color: [[1, "#2E3A4E"]],
          },
        },
        axisTick: { show: false },
        splitLine: {
          length: 8,
          lineStyle: { width: 2, color: "#475569" },
        },
        axisLabel: {
          distance: 25,
          color: "#94A3B8",
          fontSize: 11,
        },
        pointer: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, "70%"],
          fontSize: 12,
          color: "#94A3B8",
        },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontWeight: "bold",
          offsetCenter: [0, "30%"],
          color: "#E2E8F0",
        },
        data: [{ value, name: label }],
      },
    ],
  };
}

function buildGoalOptions(
  data: ChartData,
  metrics: MetricAggregation[]
): EChartsOption {
  // Goal chart: value vs a target (use total as target or derive from max)
  const value = extractFirstValue(data);
  const target = data.total ?? computeGaugeMax(value);
  const label = metrics[0]?.label ?? "Progress";
  const percentage = target > 0 ? Math.round((value / target) * 100) : 0;

  return {
    tooltip: {
      ...DARK_CHART_THEME.tooltip,
    },
    series: [
      {
        type: "gauge" as const,
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: target,
        progress: {
          show: true,
          width: 18,
          roundCap: true,
          itemStyle: {
            color: percentage >= 100 ? "#10B981" : "#3B82F6",
          },
        },
        axisLine: {
          lineStyle: {
            width: 18,
            color: [[1, "#2E3A4E"]],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, "70%"],
          fontSize: 12,
          color: "#94A3B8",
        },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontWeight: "bold",
          offsetCenter: [0, "30%"],
          formatter: `${percentage}%`,
          color: "#E2E8F0",
        },
        data: [{ value, name: label }],
      },
    ],
  };
}

function buildHeatMapOptions(
  data: ChartData,
  _metrics?: MetricAggregation[],
  _buckets?: BucketAggregation[]
): EChartsOption {
  void _metrics; void _buckets;
  // HeatMap expects data as [xIndex, yIndex, value] triples
  // Categories provide x-axis labels, series names provide y-axis labels
  const xCategories = data.categories ?? [];
  const yCategories = data.series.map((s) => s.name);

  // Build heatmap data: [x, y, value]
  const heatmapData: [number, number, number][] = [];
  let maxValue = 0;

  data.series.forEach((s, yIdx) => {
    s.data.forEach((item, xIdx) => {
      const val = typeof item === "number" ? item : item.value;
      heatmapData.push([xIdx, yIdx, val]);
      if (val > maxValue) maxValue = val;
    });
  });

  return {
    tooltip: {
      position: "top",
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, number] };
        const x = xCategories[p.data[0]] ?? p.data[0];
        const y = yCategories[p.data[1]] ?? p.data[1];
        return `${x}<br/>${y}: <strong>${p.data[2]}</strong>`;
      },
      ...DARK_CHART_THEME.tooltip,
    },
    grid: {
      ...DARK_CHART_THEME.grid,
      top: "10%",
      bottom: "15%",
    },
    xAxis: {
      type: "category",
      data: xCategories,
      splitArea: { show: false },
      ...DARK_CHART_THEME.categoryAxis,
    },
    yAxis: {
      type: "category",
      data: yCategories,
      splitArea: { show: false },
      ...DARK_CHART_THEME.categoryAxis,
    },
    visualMap: {
      min: 0,
      max: maxValue || 1,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "0%",
      inRange: {
        color: ["#1E293B", "#3B82F6", "#8B5CF6"],
      },
      textStyle: {
        color: "#94A3B8",
      },
    },
    series: [
      {
        type: "heatmap" as const,
        data: heatmapData,
        label: {
          show: heatmapData.length <= 100,
          color: "#E2E8F0",
          fontSize: 10,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function buildLegend(series: ChartSeries[]) {
  if (series.length <= 1) {
    return { show: false };
  }
  return {
    show: true,
    bottom: 0,
    textStyle: { color: "#94A3B8" },
    inactiveColor: "#475569",
  };
}

function extractNumericData(series: ChartSeries): number[] {
  return series.data.map((item) =>
    typeof item === "number" ? item : item.value
  );
}

function extractFirstValue(data: ChartData): number {
  const firstSeries = data.series[0];
  if (!firstSeries || firstSeries.data.length === 0) return 0;
  const firstItem = firstSeries.data[0];
  return typeof firstItem === "number" ? firstItem : firstItem.value;
}

function computeGaugeMax(value: number): number {
  if (value <= 0) return 100;
  // Round up to a nice number for the gauge max
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / magnitude) * magnitude || 100;
}

function getColor(index: number): string {
  return DARK_CHART_THEME.color[index % DARK_CHART_THEME.color.length];
}
