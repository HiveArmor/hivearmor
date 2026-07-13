import * as echarts from "echarts";
import { elasticService } from "@/services/elastic.service";
import type { VisualizationPayload } from "@/types/visualization-builder";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ChartKind =
  | "line" | "area" | "bar" | "bar-h"
  | "pie" | "donut" | "scatter" | "heatmap"
  | "gauge" | "stat" | "table" | "timeline";

export type Aggregation = "count" | "sum" | "avg" | "max" | "min" | "cardinality";
export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";
export type ColorScheme = "default" | "blues" | "reds" | "greens" | "sunset" | "mono";

export interface FilterRow { id: string; field: string; op: string; value: string; }

export interface WidgetConfig {
  kind: ChartKind;
  dataSource: "opensearch" | "postgres" | "static";
  indexPatternId: number | null;
  indexPatternRaw: string;
  aggregation: Aggregation;
  field: string;
  timeRange: TimeRange;
  groupBy: string;
  limit: number;
  filters: FilterRow[];
  title: string;
  subtitle: string;
  colorScheme: ColorScheme;
  showLegend: boolean;
  showLabels: boolean;
  gaugeMin: number;
  gaugeMax: number;
  thresholds: { id: string; value: number; color: string; label: string; alert: boolean }[];
  size: "1x1" | "2x1" | "2x2" | "3x1";
}

export interface AggBucket { key: string; value: number; }

export interface RealDataSeries {
  buckets: AggBucket[];
  timeSeries?: { xAxis: string[]; data: number[] };
  total: number;
  docs: Record<string, unknown>[];
}

// ─── Time range helper ────────────────────────────────────────────────────────

export const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1h":  3_600_000,
  "6h":  21_600_000,
  "24h": 86_400_000,
  "7d":  604_800_000,
  "30d": 2_592_000_000,
};

// ─── Color palettes ───────────────────────────────────────────────────────────

export const COLOR_PALETTES: Record<ColorScheme, string[]> = {
  default:  ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"],
  blues:    ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"],
  reds:     ["#991b1b", "#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca"],
  greens:   ["#14532d", "#15803d", "#16a34a", "#22c55e", "#4ade80", "#86efac"],
  sunset:   ["#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74"],
  mono:     ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6"],
};

// ─── Aggregation helpers ──────────────────────────────────────────────────────

export function aggregateDocs(
  docs: Record<string, unknown>[],
  aggregation: Aggregation,
  field: string,
  groupBy: string,
  limit: number
): AggBucket[] {
  if (docs.length === 0) return [];

  const getVal = (doc: Record<string, unknown>, f: string): unknown => {
    if (f.includes(".")) {
      const parts = f.split(".");
      let v: unknown = doc;
      for (const p of parts) {
        if (v == null || typeof v !== "object") return undefined;
        v = (v as Record<string, unknown>)[p];
      }
      return v;
    }
    return doc[f];
  };

  const groupKey = groupBy || "_all";
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const doc of docs) {
    const key = groupKey === "_all" ? "All" : String(getVal(doc, groupBy) ?? "unknown");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  const buckets: AggBucket[] = [];

  for (const [key, group] of Array.from(groups.entries())) {
    let value = 0;
    if (aggregation === "count") {
      value = group.length;
    } else if (aggregation === "cardinality") {
      const unique = new Set(group.map(d => String(getVal(d, field) ?? "")));
      value = unique.size;
    } else {
      const nums = group.map(d => Number(getVal(d, field) ?? 0)).filter(n => !isNaN(n));
      if (nums.length === 0) { value = 0; }
      else if (aggregation === "sum") value = nums.reduce((a, b) => a + b, 0);
      else if (aggregation === "avg") value = nums.reduce((a, b) => a + b, 0) / nums.length;
      else if (aggregation === "max") value = Math.max(...nums);
      else if (aggregation === "min") value = Math.min(...nums);
    }
    buckets.push({ key, value });
  }

  return buckets.sort((a, b) => b.value - a.value).slice(0, limit);
}

export function aggregateTimeSeries(
  docs: Record<string, unknown>[],
  aggregation: Aggregation,
  field: string,
  timeRangeKey: TimeRange
): { xAxis: string[]; data: number[] } {
  const rangeMs = TIME_RANGE_MS[timeRangeKey];
  const now = Date.now();
  const from = now - rangeMs;
  const bucketCount = 24;
  const bucketMs = rangeMs / bucketCount;

  const buckets: { sum: number; count: number; min: number; max: number }[] = Array.from(
    { length: bucketCount },
    () => ({ sum: 0, count: 0, min: Infinity, max: -Infinity })
  );

  for (const doc of docs) {
    const ts = doc["@timestamp"];
    if (!ts) continue;
    const t = new Date(String(ts)).getTime();
    if (isNaN(t) || t < from || t > now) continue;
    const idx = Math.min(Math.floor((t - from) / bucketMs), bucketCount - 1);
    const b = buckets[idx];
    b.count++;
    const numVal = Number(doc[field] ?? 0);
    if (!isNaN(numVal)) {
      b.sum += numVal;
      b.min = Math.min(b.min, numVal);
      b.max = Math.max(b.max, numVal);
    }
  }

  const xAxis: string[] = [];
  const data: number[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const t = from + i * bucketMs;
    const d = new Date(t);
    const label = timeRangeKey === "1h" || timeRangeKey === "6h"
      ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}h`;
    xAxis.push(label);

    const b = buckets[i];
    if (aggregation === "count") data.push(b.count);
    else if (aggregation === "sum") data.push(b.sum);
    else if (aggregation === "avg") data.push(b.count > 0 ? Math.round(b.sum / b.count * 10) / 10 : 0);
    else if (aggregation === "max") data.push(b.max === -Infinity ? 0 : b.max);
    else if (aggregation === "min") data.push(b.min === Infinity ? 0 : b.min);
    else data.push(b.count);
  }

  return { xAxis, data };
}

// ─── Real data → ECharts option ───────────────────────────────────────────────

export function buildEChartsOptionFromReal(
  kind: ChartKind,
  config: Pick<WidgetConfig, "colorScheme" | "showLegend" | "showLabels">,
  real: RealDataSeries
): echarts.EChartsOption | null {
  const palette = COLOR_PALETTES[config.colorScheme];
  const tooltipStyle = {
    backgroundColor: "var(--surface-elevated)",
    borderColor: "var(--surface-border)",
    textStyle: { color: "var(--text-primary)", fontSize: 12 },
  };
  const axisStyle = {
    axisLine: { lineStyle: { color: "var(--surface-border)" } },
    axisLabel: { color: "var(--text-muted)", fontSize: 11 },
    splitLine: { lineStyle: { color: "var(--surface-border)", type: "dashed" as const } },
  };

  if (kind === "line" || kind === "area" || kind === "timeline") {
    const ts = real.timeSeries ?? { xAxis: [], data: [] };
    if (ts.data.length === 0) return null;
    return {
      color: palette,
      tooltip: { trigger: "axis", ...tooltipStyle },
      grid: { left: 48, right: 16, top: 16, bottom: 32 },
      xAxis: { type: "category", data: ts.xAxis, ...axisStyle },
      yAxis: { type: "value", ...axisStyle },
      series: [{
        type: "line",
        data: ts.data,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: palette[0] },
        areaStyle: kind !== "line"
          ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: palette[0] + "55" },
              { offset: 1, color: palette[0] + "05" },
            ]) }
          : undefined,
        label: config.showLabels ? { show: true, fontSize: 10, color: "var(--text-muted)" } : undefined,
      }],
    };
  }

  if (kind === "bar") {
    if (real.buckets.length === 0) return null;
    return {
      color: palette,
      tooltip: { trigger: "axis", ...tooltipStyle },
      grid: { left: 48, right: 16, top: 16, bottom: 56 },
      xAxis: { type: "category", data: real.buckets.map(b => b.key), axisLabel: { color: "var(--text-muted)", fontSize: 10, rotate: 20 }, axisLine: { lineStyle: { color: "var(--surface-border)" } } },
      yAxis: { type: "value", ...axisStyle },
      series: [{
        type: "bar",
        data: real.buckets.map((b, i) => ({ value: b.value, itemStyle: { color: palette[i % palette.length] } })),
        barMaxWidth: 32,
        label: config.showLabels ? { show: true, position: "top", fontSize: 10, color: "var(--text-muted)" } : undefined,
      }],
    };
  }

  if (kind === "bar-h") {
    if (real.buckets.length === 0) return null;
    return {
      color: palette,
      tooltip: { trigger: "axis", ...tooltipStyle },
      grid: { left: 140, right: 32, top: 8, bottom: 16 },
      xAxis: { type: "value", ...axisStyle },
      yAxis: { type: "category", data: real.buckets.map(b => b.key), axisLabel: { color: "var(--text-muted)", fontSize: 10 }, axisLine: { lineStyle: { color: "var(--surface-border)" } } },
      series: [{
        type: "bar",
        data: real.buckets.map((b, i) => ({ value: b.value, itemStyle: { color: palette[i % palette.length] } })),
        barMaxWidth: 20,
        label: config.showLabels ? { show: true, position: "right", fontSize: 10, color: "var(--text-muted)" } : undefined,
      }],
    };
  }

  if (kind === "pie" || kind === "donut") {
    if (real.buckets.length === 0) return null;
    return {
      tooltip: { trigger: "item", formatter: (p: unknown) => { const x = p as { name: string; value: number; percent: number }; return `${x.name}: <b>${x.value}</b> (${x.percent}%)`; }, ...tooltipStyle },
      legend: config.showLegend ? {
        orient: "vertical" as const, right: 8, top: "center",
        textStyle: { color: "var(--text-secondary)", fontSize: 11 },
      } : undefined,
      series: [{
        type: "pie" as const,
        radius: kind === "donut" ? ["52%", "78%"] : "72%",
        center: config.showLegend ? ["38%", "50%"] : ["50%", "50%"],
        data: real.buckets.map((b, i) => ({ value: b.value, name: b.key, itemStyle: { color: palette[i % palette.length] } })),
        label: config.showLabels ? { color: "var(--text-secondary)", fontSize: 10 } : { show: false },
        itemStyle: { borderRadius: 4, borderColor: "var(--surface-primary)", borderWidth: 2 },
      }],
    };
  }

  return null;
}

// ─── Run widget query ─────────────────────────────────────────────────────────

export async function runWidgetQuery(
  config: WidgetConfig
): Promise<{ option: echarts.EChartsOption | null; hitCount: number; real: RealDataSeries | null }> {
  if (config.dataSource !== "opensearch" || !config.indexPatternRaw) {
    return { option: null, hitCount: 0, real: null };
  }

  const now = Date.now();
  const rangeMs = TIME_RANGE_MS[config.timeRange] ?? TIME_RANGE_MS["7d"];
  const timeRange = {
    from: new Date(now - rangeMs).toISOString(),
    to: new Date(now).toISOString(),
  };

  const extraFilters = (config.filters ?? [])
    .filter(f => f.value.trim() !== "")
    .map(f => ({
      field: f.field,
      operator: f.op === "=" ? "IS" : f.op === "!=" ? "IS_NOT" : f.op === "contains" ? "CONTAIN" : "IS",
      value: f.value,
    }));

  const result = await elasticService.search({
    page: 0,
    size: 500,
    indexPattern: config.indexPatternRaw,
    filters: extraFilters,
    sort: "@timestamp,desc",
    timeRange,
  });

  const docs = result.body;
  const buckets = aggregateDocs(docs, config.aggregation, config.field, config.groupBy, config.limit);
  const timeSeries = ["line", "area", "timeline"].includes(config.kind)
    ? aggregateTimeSeries(docs, config.aggregation, config.field, config.timeRange)
    : undefined;

  const real: RealDataSeries = { buckets, timeSeries, total: result.total, docs };
  const option = buildEChartsOptionFromReal(config.kind, config, real);

  return { option, hitCount: result.total, real };
}

// ─── WidgetConfig → VisualizationPayload translation ─────────────────────────

// Java enum ChartType values (uppercase)
const KIND_TO_CHART_TYPE: Record<ChartKind, string> = {
  line:     "LINE_CHART",
  area:     "AREA_CHART",
  bar:      "VERTICAL_BAR_CHART",
  "bar-h":  "HORIZONTAL_BAR_CHART",
  pie:      "PIE_CHART",
  donut:    "PIE_CHART",
  scatter:  "VERTICAL_BAR_CHART",
  heatmap:  "HEATMAP_CHART",
  gauge:    "GAUGE_CHART",
  stat:     "METRIC_CHART",
  table:    "TABLE_CHART",
  timeline: "LINE_CHART",
};

const AGG_TO_BACKEND: Record<Aggregation, string> = {
  count:       "COUNT",
  sum:         "SUM",
  avg:         "AVERAGE",
  max:         "MAX",
  min:         "MIN",
  cardinality: "COUNT",
};

export function widgetConfigToVisualizationPayload(
  config: WidgetConfig,
  name: string,
  description = ""
): VisualizationPayload {
  return {
    name,
    description,
    chartType: KIND_TO_CHART_TYPE[config.kind] ?? "bar_chart",
    chartConfig: JSON.stringify(config),
    idPattern: config.indexPatternId ?? 0,
    pattern: config.indexPatternId ? { id: config.indexPatternId, pattern: config.indexPatternRaw } : null,
    eventType: config.indexPatternRaw,
    filterType: (config.filters ?? [])
      .filter(f => f.value.trim() !== "")
      .map(f => ({
        field: f.field,
        operator: f.op === "=" ? "IS" : f.op === "!=" ? "IS_NOT" : f.op === "contains" ? "CONTAIN" : "IS",
        value: f.value,
      })),
    aggregationType: {
      metrics: [{
        id: "m1",
        aggregation: AGG_TO_BACKEND[config.aggregation] ?? "COUNT",
        field: config.aggregation === "count" ? null : (config.field || null),
      }],
      bucket: config.groupBy ? {
        id: "b1",
        aggregation: "TERMS",
        type: "BUCKET",
        field: config.groupBy,
        terms: { sortBy: "_count", asc: false, size: config.limit },
      } : null,
    },
    queryLanguage: "DSL",
    showTime: true,
  };
}
