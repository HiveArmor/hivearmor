"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import {
  LineChart, AreaChart, BarChart2, BarChartHorizontal,
  PieChart, Donut, ScatterChart, Grid3x3, Gauge,
  LayoutDashboard, Table2, Activity,
  Plus, Trash2, Maximize2, X,
  Save, FileJson, Check, AlertTriangle,
  Palette, SlidersHorizontal,
  Database,
  ChevronRight, Layers, Play, Loader2, RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { elasticService } from "@/services/elastic.service";
import type { IndexPattern } from "@/services/elastic.service";
import { visualizationService } from "@/services/visualization.service";
import { widgetConfigToVisualizationPayload } from "@/lib/widget-runner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartKind =
  | "line" | "area" | "bar" | "bar-h"
  | "pie" | "donut" | "scatter" | "heatmap"
  | "gauge" | "stat" | "table" | "timeline";

type DataSource = "opensearch" | "postgres" | "static";
type Aggregation = "count" | "sum" | "avg" | "max" | "min" | "cardinality";
type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";
type ColorScheme = "default" | "blues" | "reds" | "greens" | "sunset" | "mono";
type WidgetSize = "1x1" | "2x1" | "2x2" | "3x1";
type ConfigTab = "query" | "appearance" | "thresholds";

interface FilterRow { id: string; field: string; op: string; value: string; }
interface ThresholdRow { id: string; value: number; color: string; label: string; alert: boolean; }

interface WidgetConfig {
  kind: ChartKind;
  dataSource: DataSource;
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
  thresholds: ThresholdRow[];
  size: WidgetSize;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_TYPES: { kind: ChartKind; label: string; icon: React.ReactNode }[] = [
  { kind: "line",     label: "Line Chart",       icon: <LineChart className="w-4 h-4" /> },
  { kind: "area",     label: "Area Chart",        icon: <AreaChart className="w-4 h-4" /> },
  { kind: "bar",      label: "Bar Chart",         icon: <BarChart2 className="w-4 h-4" /> },
  { kind: "bar-h",    label: "Horizontal Bar",    icon: <BarChartHorizontal className="w-4 h-4" /> },
  { kind: "pie",      label: "Pie Chart",         icon: <PieChart className="w-4 h-4" /> },
  { kind: "donut",    label: "Donut Chart",       icon: <Donut className="w-4 h-4" /> },
  { kind: "scatter",  label: "Scatter Plot",      icon: <ScatterChart className="w-4 h-4" /> },
  { kind: "heatmap",  label: "Heatmap",           icon: <Grid3x3 className="w-4 h-4" /> },
  { kind: "gauge",    label: "Gauge",             icon: <Gauge className="w-4 h-4" /> },
  { kind: "stat",     label: "Stat / KPI",        icon: <LayoutDashboard className="w-4 h-4" /> },
  { kind: "table",    label: "Data Table",        icon: <Table2 className="w-4 h-4" /> },
  { kind: "timeline", label: "Metric Timeline",   icon: <Activity className="w-4 h-4" /> },
];

const SIEM_FIELDS = [
  "@timestamp", "event.severity", "source.ip", "destination.ip", "destination.port",
  "source.port", "event.action", "user.name", "host.name",
  "process.name", "network.protocol", "rule.name", "event.category",
  "event.type", "http.response.status_code", "dns.question.name",
  "file.path", "registry.path", "threat.indicator.type",
  // Alert-specific fields from the known v3-hive-alert-* schema
  "name", "status", "severity", "dataSource", "target", "adversary",
  "category", "impactScore",
];

const COLOR_PALETTES: Record<ColorScheme, string[]> = {
  default:  ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"],
  blues:    ["#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"],
  reds:     ["#991b1b", "#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca"],
  greens:   ["#14532d", "#15803d", "#16a34a", "#22c55e", "#4ade80", "#86efac"],
  sunset:   ["#7c2d12", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74"],
  mono:     ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6"],
};

const SIZE_LABELS: Record<WidgetSize, string> = {
  "1x1": "Small 1×1", "2x1": "Medium 2×1",
  "2x2": "Large 2×2", "3x1": "Wide 3×1",
};

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1h":  3_600_000,
  "6h":  21_600_000,
  "24h": 86_400_000,
  "7d":  604_800_000,
  "30d": 2_592_000_000,
};

// ─── Client-side aggregation helpers ──────────────────────────────────────────

interface AggBucket { key: string; value: number; }

function aggregateDocs(
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

  // Group docs by groupBy field
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

  // Sort descending by value, limit
  return buckets.sort((a, b) => b.value - a.value).slice(0, limit);
}

function aggregateTimeSeries(
  docs: Record<string, unknown>[],
  aggregation: Aggregation,
  field: string,
  timeRangeKey: TimeRange
): { xAxis: string[]; data: number[] } {
  const rangeMs = TIME_RANGE_MS[timeRangeKey];
  const now = Date.now();
  const from = now - rangeMs;

  // Determine bucket size
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

// ─── Demo fallback generators (used when datasource=static or no real data) ───

function makeDemoSeries(kind: ChartKind, config: WidgetConfig) {
  if (kind === "line" || kind === "area" || kind === "timeline") {
    const hours = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];
    const base = [120, 88, 64, 52, 78, 145, 210, 189, 234, 198, 167, 143];
    return { xAxis: hours.map(h => `${h}:00`), data: base };
  }
  if (kind === "bar" || kind === "bar-h") {
    return {
      categories: ["SSH Brute Force", "SQL Injection", "Port Scan", "Malware C2", "Phishing", "Exfiltration"],
      data: [342, 289, 198, 156, 134, 87],
    };
  }
  if (kind === "pie" || kind === "donut") {
    return [
      { value: 412, name: "Critical" },
      { value: 867, name: "High" },
      { value: 1203, name: "Medium" },
      { value: 2341, name: "Low" },
      { value: 891, name: "Info" },
    ];
  }
  if (kind === "scatter") {
    return Array.from({ length: 40 }, (_, i) => [
      (i * 1637) % 65535,
      (i * 997) % 100,
      (i * 13) % 20 + 1,
    ]);
  }
  if (kind === "heatmap") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const data: [number, number, number][] = [];
    days.forEach((_, di) => {
      hours.forEach((_, hi) => {
        data.push([hi, di, (di * 24 + hi) % 100]);
      });
    });
    return { days, hours, data };
  }
  if (kind === "gauge") {
    return { value: Math.round((config.gaugeMax - config.gaugeMin) * 0.65 + config.gaugeMin) };
  }
  if (kind === "stat") {
    return { value: "14,832", delta: "+12.4%", label: config.field || "Events / Hour" };
  }
  if (kind === "table") {
    return {
      columns: ["Source IP", "Severity", "Count", "Last Seen"],
      rows: [
        ["192.168.1.45", "Critical", "342", "2 min ago"],
        ["10.0.0.23", "High", "198", "5 min ago"],
        ["172.16.8.12", "Medium", "87", "12 min ago"],
        ["192.168.100.5", "Low", "34", "18 min ago"],
        ["10.10.10.1", "Info", "12", "45 min ago"],
      ],
    };
  }
  return null;
}

// ─── Real data → chart series converters ─────────────────────────────────────

interface RealDataSeries {
  buckets: AggBucket[];
  timeSeries?: { xAxis: string[]; data: number[] };
  total: number;
  docs: Record<string, unknown>[];
}

function convertToChartOption(
  kind: ChartKind,
  config: WidgetConfig,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tooltip: { trigger: "item", formatter: (p: any) => `${p.name}: <b>${p.value}</b> (${p.percent}%)`, ...tooltipStyle },
      legend: config.showLegend ? {
        orient: "vertical", right: 8, top: "center",
        textStyle: { color: "var(--text-secondary)", fontSize: 11 },
      } : undefined,
      series: [{
        type: "pie",
        radius: kind === "donut" ? ["52%", "78%"] : "72%",
        center: config.showLegend ? ["38%", "50%"] : ["50%", "50%"],
        data: real.buckets.map((b, i) => ({ value: b.value, name: b.key, itemStyle: { color: palette[i % palette.length] } })),
        label: config.showLabels
          ? { color: "var(--text-secondary)", fontSize: 10 }
          : { show: false },
        itemStyle: { borderRadius: 4, borderColor: "var(--surface-primary)", borderWidth: 2 },
      }],
    };
  }

  return null;
}

// ─── ECharts demo option builders (for static/fallback) ───────────────────────

function buildDemoOption(kind: ChartKind, config: WidgetConfig): echarts.EChartsOption {
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
    const d = makeDemoSeries(kind, config) as { xAxis: string[]; data: number[] };
    return {
      color: palette,
      tooltip: { trigger: "axis", ...tooltipStyle },
      grid: { left: 48, right: 16, top: 16, bottom: 32 },
      xAxis: { type: "category", data: d.xAxis, ...axisStyle },
      yAxis: { type: "value", ...axisStyle },
      series: [{
        type: "line",
        data: d.data,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: palette[0] },
        areaStyle: kind === "area" || kind === "timeline"
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
    const d = makeDemoSeries(kind, config) as { categories: string[]; data: number[] };
    return {
      color: palette,
      tooltip: { trigger: "axis", ...tooltipStyle },
      grid: { left: 48, right: 16, top: 16, bottom: 56 },
      xAxis: { type: "category", data: d.categories, axisLabel: { color: "var(--text-muted)", fontSize: 10, rotate: 20 }, axisLine: { lineStyle: { color: "var(--surface-border)" } } },
      yAxis: { type: "value", ...axisStyle },
      series: [{
        type: "bar",
        data: d.data.map((v, i) => ({ value: v, itemStyle: { color: palette[i % palette.length] } })),
        barMaxWidth: 32,
        label: config.showLabels ? { show: true, position: "top", fontSize: 10, color: "var(--text-muted)" } : undefined,
      }],
    };
  }

  if (kind === "bar-h") {
    const d = makeDemoSeries("bar", config) as { categories: string[]; data: number[] };
    return {
      color: palette,
      tooltip: { trigger: "axis", ...tooltipStyle },
      grid: { left: 120, right: 32, top: 8, bottom: 16 },
      xAxis: { type: "value", ...axisStyle },
      yAxis: { type: "category", data: d.categories, axisLabel: { color: "var(--text-muted)", fontSize: 10 }, axisLine: { lineStyle: { color: "var(--surface-border)" } } },
      series: [{
        type: "bar",
        data: d.data.map((v, i) => ({ value: v, itemStyle: { color: palette[i % palette.length] } })),
        barMaxWidth: 20,
        label: config.showLabels ? { show: true, position: "right", fontSize: 10, color: "var(--text-muted)" } : undefined,
      }],
    };
  }

  if (kind === "pie" || kind === "donut") {
    const d = makeDemoSeries(kind, config) as { value: number; name: string }[];
    const severityColors = ["var(--color-critical)", "var(--color-high)", "var(--color-medium)", "var(--color-low)", "var(--text-muted)"];
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tooltip: { trigger: "item", formatter: (p: any) => `${p.name}: <b>${p.value}</b> (${p.percent}%)`, ...tooltipStyle },
      legend: config.showLegend ? {
        orient: "vertical", right: 8, top: "center",
        textStyle: { color: "var(--text-secondary)", fontSize: 11 },
      } : undefined,
      series: [{
        type: "pie",
        radius: kind === "donut" ? ["52%", "78%"] : "72%",
        center: config.showLegend ? ["38%", "50%"] : ["50%", "50%"],
        data: d.map((item, i) => ({ ...item, itemStyle: { color: config.colorScheme === "default" ? severityColors[i] : palette[i % palette.length] } })),
        label: config.showLabels
          ? { color: "var(--text-secondary)", fontSize: 10 }
          : { show: false },
        itemStyle: { borderRadius: 4, borderColor: "var(--surface-primary)", borderWidth: 2 },
      }],
    };
  }

  if (kind === "scatter") {
    const d = makeDemoSeries(kind, config) as number[][];
    return {
      color: palette,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tooltip: { trigger: "item", formatter: (p: any) => `Port: ${p.value[0]}<br/>Score: ${p.value[1]}<br/>Count: ${p.value[2]}`, ...tooltipStyle },
      grid: { left: 48, right: 16, top: 16, bottom: 32 },
      xAxis: { type: "value", name: "Port", nameTextStyle: { color: "var(--text-muted)" }, ...axisStyle },
      yAxis: { type: "value", name: "Risk Score", nameTextStyle: { color: "var(--text-muted)" }, ...axisStyle },
      series: [{
        type: "scatter",
        data: d,
        symbolSize: (val: number[]) => Math.sqrt(val[2]) * 4,
        itemStyle: { color: palette[0] + "cc" },
      }],
    };
  }

  if (kind === "heatmap") {
    const d = makeDemoSeries(kind, config) as { days: string[]; hours: string[]; data: [number, number, number][] };
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tooltip: { position: "top", formatter: (p: any) => `${d.days[p.value[1]]} ${d.hours[p.value[0]]}: <b>${p.value[2]}</b>`, ...tooltipStyle },
      grid: { left: 48, right: 8, top: 8, bottom: 40 },
      xAxis: { type: "category", data: d.hours, axisLabel: { color: "var(--text-muted)", fontSize: 9, interval: 3 }, axisLine: { lineStyle: { color: "var(--surface-border)" } } },
      yAxis: { type: "category", data: d.days, axisLabel: { color: "var(--text-muted)", fontSize: 10 }, axisLine: { lineStyle: { color: "var(--surface-border)" } } },
      visualMap: {
        min: 0, max: 100, show: false,
        inRange: { color: [palette[palette.length - 1] + "22", palette[0]] },
      },
      series: [{ type: "heatmap", data: d.data, itemStyle: { borderRadius: 2 } }],
    };
  }

  if (kind === "gauge") {
    const d = makeDemoSeries(kind, config) as { value: number };
    const thresholdPairs = config.thresholds.map(t => [t.value / config.gaugeMax, t.color]);
    return {
      series: [{
        type: "gauge",
        min: config.gaugeMin,
        max: config.gaugeMax,
        radius: "88%",
        center: ["50%", "60%"],
        axisLine: {
          lineStyle: {
            width: 18,
            color: config.thresholds.length > 0
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? [[...thresholdPairs, [1, palette[0] + "33"]] as any]
              : [[0.3, palette[2]], [0.7, palette[1]], [1, palette[0]]],
          },
        },
        axisTick: { show: false },
        splitLine: { length: 12, lineStyle: { color: "var(--surface-border)", width: 2 } },
        axisLabel: { color: "var(--text-muted)", fontSize: 10, distance: 24 },
        pointer: { itemStyle: { color: palette[0] } },
        detail: { valueAnimation: true, formatter: `{value}`, color: "var(--text-primary)", fontSize: 22, fontWeight: 700, offsetCenter: [0, "30%"] },
        data: [{ value: d.value, name: config.title || "Metric" }],
        title: { color: "var(--text-muted)", fontSize: 12 },
      }],
    };
  }

  return {};
}

// ─── Tiny SVG Thumbnails ──────────────────────────────────────────────────────

function ChartThumb({ kind }: { kind: ChartKind }) {
  const c = "var(--chart-1)";
  const c2 = "var(--chart-2)";
  const dim = "w-8 h-8";

  const thumbs: Record<ChartKind, React.ReactNode> = {
    line: (
      <svg viewBox="0 0 32 20" className={dim}>
        <polyline points="2,16 8,12 14,8 20,10 26,4 30,6" stroke={c} strokeWidth="1.5" fill="none" />
      </svg>
    ),
    area: (
      <svg viewBox="0 0 32 20" className={dim}>
        <path d="M2,16 8,10 14,7 20,9 26,4 30,5 30,18 2,18Z" fill={c + "55"} stroke={c} strokeWidth="1.5" />
      </svg>
    ),
    bar: (
      <svg viewBox="0 0 32 20" className={dim}>
        {[2, 8, 14, 20, 26].map((x, i) => (
          <rect key={x} x={x} y={18 - [10, 16, 8, 14, 12][i]} width="4" height={[10, 16, 8, 14, 12][i]} rx="1" fill={i === 0 ? c : c + "88"} />
        ))}
      </svg>
    ),
    "bar-h": (
      <svg viewBox="0 0 32 20" className={dim}>
        {[2, 6, 10, 14, 18].map((y, i) => (
          <rect key={y} x="2" y={y} width={[20, 28, 14, 24, 18][i]} height="2.5" rx="1" fill={i === 0 ? c : c + "88"} />
        ))}
      </svg>
    ),
    pie: (
      <svg viewBox="0 0 20 20" className={dim}>
        <circle cx="10" cy="10" r="8" fill="none" stroke={c} strokeWidth="8" strokeDasharray="20 32" />
        <circle cx="10" cy="10" r="8" fill="none" stroke={c2} strokeWidth="8" strokeDasharray="12 40" strokeDashoffset="-20" />
      </svg>
    ),
    donut: (
      <svg viewBox="0 0 20 20" className={dim}>
        <circle cx="10" cy="10" r="7" fill="none" stroke={c} strokeWidth="4" strokeDasharray="22 22" />
        <circle cx="10" cy="10" r="7" fill="none" stroke={c2} strokeWidth="4" strokeDasharray="10 34" strokeDashoffset="-22" />
      </svg>
    ),
    scatter: (
      <svg viewBox="0 0 32 20" className={dim}>
        {[[4,14],[8,6],[12,16],[18,4],[22,11],[26,8],[28,15]].map(([x,y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.5 : 1.5} fill={c} fillOpacity={0.7} />
        ))}
      </svg>
    ),
    heatmap: (
      <svg viewBox="0 0 32 20" className={dim}>
        {Array.from({ length: 4 }, (_, row) =>
          Array.from({ length: 7 }, (_, col) => (
            <rect key={`${row}-${col}`} x={col * 4.4 + 1} y={row * 4.5 + 1} width="3.5" height="3.5" rx="0.5"
              fill={c} fillOpacity={(row * 7 + col) % 28 / 28 * 0.8 + 0.1} />
          ))
        )}
      </svg>
    ),
    gauge: (
      <svg viewBox="0 0 32 20" className={dim}>
        <path d="M4,18 A12,12 0 0,1 28,18" stroke="var(--surface-tertiary)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M4,18 A12,12 0 0,1 20,8" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
        <line x1="16" y1="18" x2="20" y2="9" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    stat: (
      <svg viewBox="0 0 32 20" className={dim}>
        <text x="3" y="13" fontSize="9" fontWeight="700" fill={c}>42K</text>
        <text x="3" y="18" fontSize="4" fill="var(--text-muted)">events/hr</text>
        <polyline points="20,14 23,10 26,12 30,6" stroke="#22c55e" strokeWidth="1.5" fill="none" />
      </svg>
    ),
    table: (
      <svg viewBox="0 0 32 20" className={dim}>
        <rect x="2" y="2" width="28" height="4" rx="1" fill={c + "44"} />
        {[8, 13, 17].map(y => (
          <rect key={y} x="2" y={y} width="28" height="2.5" rx="0.5" fill="var(--surface-tertiary)" />
        ))}
      </svg>
    ),
    timeline: (
      <svg viewBox="0 0 32 20" className={dim}>
        <path d="M2,12 6,10 10,14 14,6 18,8 22,4 26,7 30,5" stroke={c} strokeWidth="1.5" fill="none" />
        <path d="M2,12 6,10 10,14 14,6 18,8 22,4 26,7 30,5 30,18 2,18Z" fill={c + "33"} />
        {[6,10,14,18,22,26].map(x => (
          <circle key={x} cx={x} cy={[10,14,6,8,4,7][[6,10,14,18,22,26].indexOf(x)]} r="1.5" fill={c} />
        ))}
      </svg>
    ),
  };

  return <>{thumbs[kind]}</>;
}

// ─── Default config ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WidgetConfig = {
  kind: "bar",
  dataSource: "opensearch",
  indexPatternId: null,
  indexPatternRaw: "",
  aggregation: "count",
  field: "severity",
  timeRange: "7d",
  groupBy: "severity",
  limit: 10,
  filters: [],
  title: "Alert Count by Severity",
  subtitle: "Count of security events per severity level",
  colorScheme: "default",
  showLegend: true,
  showLabels: false,
  gaugeMin: 0,
  gaugeMax: 100,
  thresholds: [],
  size: "2x1",
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function FilterBuilder({ filters, onChange }: { filters: FilterRow[]; onChange: (f: FilterRow[]) => void }) {
  const addFilter = () => {
    onChange([...filters, { id: Math.random().toString(36).slice(2), field: "severity", op: "=", value: "" }]);
  };
  const removeFilter = (id: string) => onChange(filters.filter(f => f.id !== id));
  const updateFilter = (id: string, patch: Partial<FilterRow>) =>
    onChange(filters.map(f => f.id === id ? { ...f, ...patch } : f));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-small text-muted">Filters</span>
        <button onClick={addFilter} className="btn-sm btn-secondary flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add Filter
        </button>
      </div>
      {filters.length === 0 && (
        <p className="text-tiny text-muted italic">No filters applied — showing all documents</p>
      )}
      {filters.map(f => (
        <div key={f.id} className="flex items-center gap-1.5">
          <select value={f.field} onChange={e => updateFilter(f.id, { field: e.target.value })}
            className="input-base text-tiny flex-1 py-1">
            {SIEM_FIELDS.map(sf => <option key={sf} value={sf}>{sf}</option>)}
          </select>
          <select value={f.op} onChange={e => updateFilter(f.id, { op: e.target.value })}
            className="input-base text-tiny w-14 py-1">
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value=">">{">"}</option>
            <option value="<">{"<"}</option>
            <option value="contains">~</option>
          </select>
          <input value={f.value} onChange={e => updateFilter(f.id, { value: e.target.value })}
            className="input-base text-tiny flex-1 py-1" placeholder="value" />
          <button onClick={() => removeFilter(f.id)} className="toolbar-btn text-muted hover:text-critical shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ThresholdBuilder({ thresholds, onChange }: { thresholds: ThresholdRow[]; onChange: (t: ThresholdRow[]) => void }) {
  const add = () => onChange([...thresholds, { id: Math.random().toString(36).slice(2), value: 80, color: "#ef4444", label: "Critical", alert: false }]);
  const remove = (id: string) => onChange(thresholds.filter(t => t.id !== id));
  const update = (id: string, patch: Partial<ThresholdRow>) =>
    onChange(thresholds.map(t => t.id === id ? { ...t, ...patch } : t));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-small text-muted">Threshold Lines</span>
        <button onClick={add} className="btn-sm btn-secondary flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add Threshold
        </button>
      </div>
      {thresholds.length === 0 && (
        <p className="text-tiny text-muted italic">No thresholds defined</p>
      )}
      {thresholds.map(t => (
        <div key={t.id} className="card bg-surface-secondary p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div>
                <label className="text-tiny text-muted block mb-1">Value</label>
                <input type="number" value={t.value} onChange={e => update(t.id, { value: Number(e.target.value) })}
                  className="input-base text-small w-full py-1" />
              </div>
              <div>
                <label className="text-tiny text-muted block mb-1">Label</label>
                <input value={t.label} onChange={e => update(t.id, { label: e.target.value })}
                  className="input-base text-small w-full py-1" />
              </div>
            </div>
            <button onClick={() => remove(t.id)} className="toolbar-btn text-muted hover:text-critical shrink-0 mt-4">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-tiny text-muted">Color</label>
              <input type="color" value={t.color} onChange={e => update(t.id, { color: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-surface-border bg-transparent" />
              <span className="text-tiny text-muted font-mono">{t.color}</span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
              <div
                onClick={() => update(t.id, { alert: !t.alert })}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative cursor-pointer",
                  t.alert ? "bg-brand" : "bg-surface-tertiary"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow",
                  t.alert ? "translate-x-4" : "translate-x-0.5"
                )} />
              </div>
              <span className="text-tiny text-muted">Alert on breach</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Static chart renderers ───────────────────────────────────────────────────

function StatKPIPreview({ config, realTotal }: { config: WidgetConfig; realTotal?: number | null }) {
  const isReal = realTotal != null;
  const displayValue = isReal
    ? realTotal! >= 1000 ? `${(realTotal! / 1000).toFixed(1)}K` : String(realTotal!)
    : "—";
  const palette = COLOR_PALETTES[config.colorScheme];
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
      <p className="text-tiny text-muted uppercase tracking-widest">{config.title || "Metric"}</p>
      <p className="kpi-xl" style={{ color: palette[0] }}>{displayValue}</p>
      {config.subtitle && <p className="text-tiny text-muted">{config.subtitle}</p>}
    </div>
  );
}

function TablePreview({ config, realDocs }: { config: WidgetConfig; realDocs?: Record<string, unknown>[] | null }) {
  const isReal = realDocs && realDocs.length > 0;

  if (isReal) {
    // Determine columns from first doc's top-level fields (up to 5)
    const allKeys = Object.keys(realDocs![0]).filter(k => k !== "_index" && k !== "_type" && k !== "_id" && k !== "_score");
    const cols = allKeys.slice(0, 5);
    const rows = realDocs!.slice(0, config.limit).map(doc =>
      cols.map(c => String(doc[c] ?? "—").slice(0, 40))
    );
    return (
      <div className="overflow-auto h-full">
        <table className="w-full text-tiny">
          <thead>
            <tr className="border-b border-surface-border">
              {cols.map(col => (
                <th key={col} className="px-2 py-1.5 text-left text-muted font-medium uppercase tracking-wider whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-surface-border/50 hover:bg-surface-tertiary/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-secondary whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const d = makeDemoSeries("table", config) as { columns: string[]; rows: string[][] };
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-tiny">
        <thead>
          <tr className="border-b border-surface-border">
            {d.columns.map(col => (
              <th key={col} className="px-2 py-1.5 text-left text-muted font-medium uppercase tracking-wider whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-surface-border/50 hover:bg-surface-tertiary/50">
              {row.map((cell, ci) => (
                <td key={ci} className={cn(
                  "px-2 py-1.5 text-secondary whitespace-nowrap",
                  ci === 1 && cell === "Critical" && "text-critical",
                  ci === 1 && cell === "High" && "text-warning",
                  ci === 1 && cell === "Medium" && "text-brand",
                  ci === 1 && cell === "Low" && "text-success",
                )}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WidgetCreatorPage() {
  const router = useRouter();
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<ConfigTab>("query");
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Save widget modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveWidgetName, setSaveWidgetName] = useState("");
  const [saveWidgetDesc, setSaveWidgetDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedVizId, setSavedVizId] = useState<number | null>(null);

  // Real data state
  const [indexPatterns, setIndexPatterns] = useState<IndexPattern[]>([]);
  const [loadingPatterns, setLoadingPatterns] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [realData, setRealData] = useState<RealDataSeries | null>(null);
  const [hitCount, setHitCount] = useState<number | null>(null);

  // Load index patterns on mount
  useEffect(() => {
    setLoadingPatterns(true);
    elasticService.getIndexPatterns()
      .then(patterns => {
        setIndexPatterns(patterns);
        // Auto-select first alert pattern
        if (patterns.length > 0) {
          const alertPattern = patterns.find(p => p.pattern?.includes("alert") || p.name?.includes("alert"));
          const chosen = alertPattern ?? patterns[0];
          setConfig(prev => ({
            ...prev,
            indexPatternId: chosen.id,
            indexPatternRaw: chosen.pattern || chosen.name || "",
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPatterns(false));
  }, []);

  const update = useCallback(<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const handlePatternChange = useCallback((id: number) => {
    const p = indexPatterns.find(ip => ip.id === id);
    setConfig(prev => ({
      ...prev,
      indexPatternId: id,
      indexPatternRaw: p ? (p.pattern || p.name || "") : prev.indexPatternRaw,
    }));
    setRealData(null);
    setHitCount(null);
  }, [indexPatterns]);

  const runQuery = useCallback(async () => {
    if (config.dataSource !== "opensearch") {
      setRealData(null);
      return;
    }
    const pattern = config.indexPatternRaw || "v3-hive-*";
    setQueryLoading(true);
    setQueryError(null);

    try {
      const now = Date.now();
      const rangeMs = TIME_RANGE_MS[config.timeRange];
      const timeRange = {
        from: new Date(now - rangeMs).toISOString(),
        to: new Date(now).toISOString(),
      };

      // Build filters from filter rows
      const extraFilters = config.filters
        .filter(f => f.value.trim() !== "")
        .map(f => ({
          field: f.field,
          operator: f.op === "=" ? "IS" : f.op === "!=" ? "IS_NOT" : f.op === "contains" ? "CONTAIN" : "IS",
          value: f.value,
        }));

      const result = await elasticService.search({
        page: 0,
        size: 500,
        indexPattern: pattern,
        filters: extraFilters,
        sort: "@timestamp,desc",
        timeRange,
      });

      const docs = result.body;
      setHitCount(result.total);

      // Compute aggregations client-side
      const buckets = aggregateDocs(docs, config.aggregation, config.field, config.groupBy, config.limit);
      const timeSeries = ["line", "area", "timeline"].includes(config.kind)
        ? aggregateTimeSeries(docs, config.aggregation, config.field, config.timeRange)
        : undefined;

      setRealData({
        buckets,
        timeSeries,
        total: result.total,
        docs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Query failed";
      setQueryError(msg);
      toast("error", "Query failed", msg);
    } finally {
      setQueryLoading(false);
    }
  }, [config]);

  // Build the chart option — use real data when available, fall back to demo
  const chartOption = useMemo((): echarts.EChartsOption => {
    if (realData && config.dataSource === "opensearch") {
      const real = convertToChartOption(config.kind, config, realData);
      if (real) return real;
    }
    return buildDemoOption(config.kind, config);
  }, [config, realData]);

  const isEChartsType = !["stat", "table"].includes(config.kind);
  const isGauge = config.kind === "gauge";
  const isUsingRealData = realData != null && config.dataSource === "opensearch";

  const exportJSON = () => {
    const json = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("success", "Widget JSON copied to clipboard");
    }).catch(() => toast("error", "Failed to copy JSON"));
  };

  const openSaveModal = () => {
    setSaveWidgetName(config.title || "Untitled Widget");
    setSaveWidgetDesc(config.subtitle || "");
    setSavedVizId(null);
    setShowSaveModal(true);
  };

  const handleSaveWidget = async () => {
    if (!saveWidgetName.trim()) return;
    setSaving(true);
    try {
      const payload = widgetConfigToVisualizationPayload(config, saveWidgetName.trim(), saveWidgetDesc.trim());
      const saved = await visualizationService.create(payload);
      if (saved) {
        setSavedVizId(saved.id);
        toast("success", "Widget saved", `"${saveWidgetName}" saved to widget library`);
      } else {
        toast("error", "Save failed", "Could not save widget — check console");
      }
    } catch {
      toast("error", "Save failed", "An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  const TABS: { id: ConfigTab; label: string; icon: React.ReactNode }[] = [
    { id: "query",      label: "Query",      icon: <Database className="w-3.5 h-3.5" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="w-3.5 h-3.5" /> },
    { id: "thresholds", label: "Thresholds", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] overflow-hidden">
      {/* ── Page header ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div>
          <h1 className="text-h1">Widget Creator</h1>
          <p className="text-secondary text-small mt-0.5">Build and configure dashboard widgets for HiveArmor</p>
        </div>
        <div className="flex items-center gap-1.5 text-tiny text-muted">
          <Layers className="w-3.5 h-3.5" />
          <span>Creator</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-primary">{config.title || "New Widget"}</span>
        </div>
      </div>

      {/* ── 3-panel layout ─────────────────────────────────── */}
      <div className="flex flex-1 gap-3 min-h-0">

        {/* ── LEFT: Chart type gallery (260px) ──────────────── */}
        <aside className="w-[260px] shrink-0 flex flex-col gap-3">
          <div className="card flex-1 overflow-y-auto p-3">
            <p className="text-tiny text-muted uppercase tracking-wider font-medium mb-2.5">Chart Type</p>
            <div className="grid grid-cols-2 gap-1.5">
              {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
              {CHART_TYPES.map(({ kind, label, icon: _icon }) => (
                <button
                  key={kind}
                  onClick={() => { update("kind", kind); setRealData(null); }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all text-center",
                    config.kind === kind
                      ? "border-brand bg-brand/8 text-brand"
                      : "border-surface-border bg-surface-secondary hover:bg-surface-tertiary hover:border-surface-border-strong text-muted hover:text-secondary"
                  )}
                >
                  <ChartThumb kind={kind} />
                  <span className="text-tiny font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Size selector */}
          <div className="card p-3 shrink-0">
            <p className="text-tiny text-muted uppercase tracking-wider font-medium mb-2">Widget Size</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.entries(SIZE_LABELS) as [WidgetSize, string][]).map(([sz, label]) => (
                <button
                  key={sz}
                  onClick={() => update("size", sz)}
                  className={cn(
                    "px-2 py-1.5 rounded text-tiny border transition-all",
                    config.size === sz
                      ? "border-brand bg-brand/8 text-brand font-medium"
                      : "border-surface-border text-muted hover:text-secondary hover:bg-surface-secondary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── CENTER: Configuration form ─────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col card overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-0.5 border-b border-surface-border px-3 pt-3 shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-small rounded-t border-b-2 -mb-px transition-all",
                  activeTab === tab.id
                    ? "border-brand text-brand font-medium"
                    : "border-transparent text-muted hover:text-secondary"
                )}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
            <div className="flex-1" />
            {/* Run Query button */}
            {config.dataSource === "opensearch" && (
              <button
                onClick={runQuery}
                disabled={queryLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-small bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors mb-1"
              >
                {queryLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run Query
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── QUERY TAB ───────────────────────── */}
            {activeTab === "query" && (
              <>
                {/* Data source */}
                <div className="space-y-1.5">
                  <label className="text-small text-secondary font-medium">Data Source</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["opensearch", "postgres", "static"] as DataSource[]).map(ds => (
                      <button
                        key={ds}
                        onClick={() => { update("dataSource", ds); setRealData(null); }}
                        className={cn(
                          "px-3 py-2 rounded-lg border text-small transition-all",
                          config.dataSource === ds
                            ? "border-brand bg-brand/8 text-brand font-medium"
                            : "border-surface-border text-muted hover:text-secondary hover:bg-surface-secondary"
                        )}
                      >
                        {ds === "opensearch" ? "OpenSearch" : ds === "postgres" ? "PostgreSQL" : "Manual / Static"}
                      </button>
                    ))}
                  </div>
                </div>

                {config.dataSource === "opensearch" && (
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Index Pattern</label>
                    {loadingPatterns ? (
                      <div className="flex items-center gap-2 text-small text-muted">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading patterns…
                      </div>
                    ) : indexPatterns.length > 0 ? (
                      <select
                        value={config.indexPatternId ?? ""}
                        onChange={e => handlePatternChange(Number(e.target.value))}
                        className="input-base w-full font-mono text-small"
                      >
                        <option value="" disabled>Select index pattern…</option>
                        {indexPatterns.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.pattern || p.name || `Pattern #${p.id}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={config.indexPatternRaw}
                        onChange={e => update("indexPatternRaw", e.target.value)}
                        placeholder="v3-hive-*, auditbeat-*, filebeat-*"
                        className="input-base w-full font-mono text-small"
                      />
                    )}
                    {config.indexPatternRaw && (
                      <p className="text-tiny text-muted">Pattern: <code className="font-mono">{config.indexPatternRaw}</code></p>
                    )}
                  </div>
                )}

                {config.dataSource === "postgres" && (
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Table / Query</label>
                    <input
                      value={config.indexPatternRaw}
                      onChange={e => update("indexPatternRaw", e.target.value)}
                      placeholder="incidents, alerts, utm_sources..."
                      className="input-base w-full font-mono text-small"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Aggregation</label>
                    <select value={config.aggregation} onChange={e => { update("aggregation", e.target.value as Aggregation); setRealData(null); }}
                      className="input-base w-full">
                      <option value="count">Count</option>
                      <option value="sum">Sum</option>
                      <option value="avg">Average</option>
                      <option value="max">Max</option>
                      <option value="min">Min</option>
                      <option value="cardinality">Cardinality (unique)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">
                      {config.aggregation === "count" ? "Filter Field" : "Metric Field"}
                    </label>
                    <select value={config.field} onChange={e => { update("field", e.target.value); setRealData(null); }}
                      className="input-base w-full">
                      {SIEM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Time Range</label>
                    <select value={config.timeRange} onChange={e => { update("timeRange", e.target.value as TimeRange); setRealData(null); }}
                      className="input-base w-full">
                      <option value="1h">Last 1 hour</option>
                      <option value="6h">Last 6 hours</option>
                      <option value="24h">Last 24 hours</option>
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Limit (Top N)</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={config.limit}
                      onChange={e => update("limit", Number(e.target.value))}
                      className="input-base w-full"
                    />
                  </div>
                </div>

                {!["stat", "gauge"].includes(config.kind) && (
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">
                      Group By <span className="text-tiny text-muted font-normal">(for bar / pie / line series)</span>
                    </label>
                    <select value={config.groupBy} onChange={e => { update("groupBy", e.target.value); setRealData(null); }}
                      className="input-base w-full">
                      <option value="">— None (single bucket) —</option>
                      {SIEM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}

                <div className="border-t border-surface-border pt-4">
                  <FilterBuilder filters={config.filters} onChange={f => { update("filters", f); setRealData(null); }} />
                </div>

                {/* Query status */}
                {queryError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-critical/10 border border-critical/20">
                    <AlertTriangle className="w-4 h-4 text-critical shrink-0 mt-0.5" />
                    <p className="text-small text-critical">{queryError}</p>
                  </div>
                )}
                {isUsingRealData && hitCount != null && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/8 border border-success/20">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <p className="text-small text-success">
                      Query returned <strong>{hitCount.toLocaleString()}</strong> documents · showing top {config.limit} buckets
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ── APPEARANCE TAB ──────────────────── */}
            {activeTab === "appearance" && (
              <>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Title</label>
                    <input value={config.title} onChange={e => update("title", e.target.value)}
                      placeholder="Widget title" className="input-base w-full" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-small text-secondary font-medium">Subtitle</label>
                    <input value={config.subtitle} onChange={e => update("subtitle", e.target.value)}
                      placeholder="Descriptive subtitle (optional)" className="input-base w-full" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-small text-secondary font-medium">Color Scheme</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(COLOR_PALETTES) as [ColorScheme, string[]][]).map(([scheme, colors]) => (
                      <button
                        key={scheme}
                        onClick={() => update("colorScheme", scheme)}
                        className={cn(
                          "flex flex-col gap-1.5 p-2 rounded-lg border transition-all",
                          config.colorScheme === scheme
                            ? "border-brand bg-brand/8"
                            : "border-surface-border hover:border-surface-border-strong hover:bg-surface-secondary"
                        )}
                      >
                        <div className="flex gap-0.5">
                          {colors.slice(0, 6).map((c, i) => (
                            <div key={i} className="w-4 h-4 rounded-sm flex-1" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <span className={cn("text-tiny capitalize", config.colorScheme === scheme ? "text-brand font-medium" : "text-muted")}>
                          {scheme}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => update("showLegend", !config.showLegend)}
                      className={cn("w-8 h-4 rounded-full transition-colors relative cursor-pointer", config.showLegend ? "bg-brand" : "bg-surface-tertiary")}>
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow", config.showLegend ? "translate-x-4" : "translate-x-0.5")} />
                    </div>
                    <span className="text-small text-secondary">Show Legend</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => update("showLabels", !config.showLabels)}
                      className={cn("w-8 h-4 rounded-full transition-colors relative cursor-pointer", config.showLabels ? "bg-brand" : "bg-surface-tertiary")}>
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow", config.showLabels ? "translate-x-4" : "translate-x-0.5")} />
                    </div>
                    <span className="text-small text-secondary">Show Data Labels</span>
                  </label>
                </div>

                {isGauge && (
                  <div className="border-t border-surface-border pt-4 space-y-3">
                    <p className="text-small text-secondary font-medium">Gauge Options</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-small text-muted">Min Value</label>
                        <input type="number" value={config.gaugeMin}
                          onChange={e => update("gaugeMin", Number(e.target.value))}
                          className="input-base w-full" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-small text-muted">Max Value</label>
                        <input type="number" value={config.gaugeMax}
                          onChange={e => update("gaugeMax", Number(e.target.value))}
                          className="input-base w-full" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── THRESHOLDS TAB ──────────────────── */}
            {activeTab === "thresholds" && (
              <>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-secondary border border-surface-border">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-small text-secondary font-medium">Threshold Lines</p>
                    <p className="text-tiny text-muted mt-0.5">
                      Threshold lines are drawn on the chart at the specified value. Enable alerting to trigger
                      a notification when the metric exceeds the threshold.
                    </p>
                  </div>
                </div>
                <ThresholdBuilder thresholds={config.thresholds} onChange={t => update("thresholds", t)} />
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Live preview (340px) ────────────────────── */}
        <aside className="w-[340px] shrink-0 flex flex-col gap-3">
          <div className="card flex-1 flex flex-col overflow-hidden">
            {/* Preview header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-surface-border shrink-0">
              <div className="flex items-center gap-2">
                {queryLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                ) : (
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    isUsingRealData ? "bg-success animate-pulse" : "bg-muted"
                  )} />
                )}
                <span className="text-small text-muted font-medium">
                  {queryLoading ? "Running query…" : isUsingRealData ? "Live Data" : "Demo Preview"}
                </span>
                {hitCount != null && !queryLoading && (
                  <span className="text-tiny text-muted">({hitCount.toLocaleString()} docs)</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isUsingRealData && (
                  <button onClick={runQuery} className="toolbar-btn text-muted hover:text-primary" title="Refresh">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => setFullscreen(true)} className="toolbar-btn text-muted hover:text-primary" title="Full screen">
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Widget title */}
            {config.title && (
              <div className="px-3 pt-2.5 shrink-0">
                <p className="text-h4 text-primary">{config.title}</p>
                {config.subtitle && <p className="text-tiny text-muted mt-0.5">{config.subtitle}</p>}
              </div>
            )}

            {/* Chart area */}
            <div className="flex-1 min-h-0 p-3">
              {queryLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-muted">
                  <Loader2 className="w-8 h-8 animate-spin text-brand" />
                  <span className="text-small">Querying OpenSearch…</span>
                </div>
              ) : isEChartsType ? (
                <ReactECharts
                  key={`${config.kind}-${config.colorScheme}-${isUsingRealData ? "real" : "demo"}`}
                  option={chartOption}
                  style={{ width: "100%", height: "100%" }}
                  opts={{ renderer: "canvas" }}
                  theme="dark"
                />
              ) : config.kind === "stat" ? (
                <StatKPIPreview config={config} realTotal={isUsingRealData ? realData?.total : null} />
              ) : (
                <TablePreview config={config} realDocs={isUsingRealData ? realData?.docs.slice(0, config.limit) : null} />
              )}
            </div>

            {/* Threshold indicators */}
            {config.thresholds.length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
                {config.thresholds.map(t => (
                  <span key={t.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny border"
                    style={{ borderColor: t.color + "88", color: t.color, backgroundColor: t.color + "15" }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                    {t.label}: {t.value}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Config summary chip */}
          <div className="card p-3 shrink-0">
            <p className="text-tiny text-muted uppercase tracking-wider font-medium mb-2">Config Summary</p>
            <div className="space-y-1">
              {[
                ["Source",  config.dataSource === "opensearch" ? "OpenSearch" : config.dataSource === "postgres" ? "PostgreSQL" : "Static"],
                ["Index",   config.dataSource !== "static" ? (config.indexPatternRaw || "—") : "—"],
                ["Metric",  `${config.aggregation.toUpperCase()}(${config.field})`],
                ["Group By", config.groupBy || "—"],
                ["Range",   `Last ${config.timeRange}`],
                ["Size",    SIZE_LABELS[config.size]],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-tiny text-muted">{k}</span>
                  <span className="text-tiny text-secondary font-mono truncate max-w-[160px]">{v}</span>
                </div>
              ))}
              {config.filters.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-tiny text-muted">Filters</span>
                  <span className="text-tiny text-brand">{config.filters.length} applied</span>
                </div>
              )}
              {isUsingRealData && (
                <div className="flex items-center justify-between border-t border-surface-border pt-1 mt-1">
                  <span className="text-tiny text-muted">Buckets</span>
                  <span className="text-tiny text-success">{realData?.buckets.length ?? 0} returned</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Bottom action bar ─────────────────────────────── */}
      <div className="shrink-0 mt-3 flex items-center justify-between border-t border-surface-border pt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={openSaveModal}
            className="btn btn-primary flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Widget
          </button>

          <button
            onClick={() => router.push("/creator/dashboards/new")}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            Add to Dashboard
          </button>

          <button onClick={exportJSON} className="btn btn-secondary flex items-center gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <FileJson className="w-3.5 h-3.5" />}
            Export JSON
          </button>
        </div>

        <button
          onClick={() => {
            setConfig(DEFAULT_CONFIG);
            setRealData(null);
            setHitCount(null);
            setQueryError(null);
            toast("info", "Widget reset", "Configuration restored to defaults");
          }}
          className="btn btn-ghost text-muted hover:text-primary flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* ── Save Widget Modal ────────────────────────────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center" onClick={() => !saving && setShowSaveModal(false)}>
          <div className="card w-[440px] p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-h3 text-primary">Save Widget</h2>
              <button onClick={() => !saving && setShowSaveModal(false)} className="toolbar-btn text-muted hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-small text-secondary font-medium">Widget Name *</label>
                <input
                  value={saveWidgetName}
                  onChange={e => setSaveWidgetName(e.target.value)}
                  placeholder="e.g. Alert Count by Severity"
                  className="input-base w-full"
                  autoFocus
                  disabled={saving || savedVizId != null}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-small text-secondary font-medium">Description</label>
                <input
                  value={saveWidgetDesc}
                  onChange={e => setSaveWidgetDesc(e.target.value)}
                  placeholder="Optional description"
                  className="input-base w-full"
                  disabled={saving || savedVizId != null}
                />
              </div>
            </div>

            {savedVizId != null ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success/8 border border-success/20">
                  <Check className="w-4 h-4 text-success shrink-0" />
                  <p className="text-small text-success">Widget saved successfully!</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/creator/dashboards/new?addViz=${savedVizId}`)}
                    className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Add to Dashboard
                  </button>
                  <button
                    onClick={() => router.push("/creator/visualizations")}
                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
                  >
                    View Widgets
                  </button>
                </div>
                <button onClick={() => setShowSaveModal(false)} className="w-full text-center text-small text-muted hover:text-secondary transition-colors py-1">
                  Continue editing
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-2 border-t border-surface-border">
                <button
                  onClick={handleSaveWidget}
                  disabled={saving || !saveWidgetName.trim()}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? "Saving…" : "Save Widget"}
                </button>
                <button
                  onClick={() => setShowSaveModal(false)}
                  disabled={saving}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fullscreen preview modal ──────────────────────── */}
      {fullscreen && (
        <div className="fixed inset-0 z-[300] bg-surface-ground flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
            <div>
              <h2 className="text-h2">{config.title || "Widget Preview"}</h2>
              {config.subtitle && <p className="text-small text-secondary mt-0.5">{config.subtitle}</p>}
              {isUsingRealData && hitCount != null && (
                <p className="text-tiny text-success mt-0.5">{hitCount.toLocaleString()} documents · live data</p>
              )}
            </div>
            <button onClick={() => setFullscreen(false)} className="toolbar-btn text-muted hover:text-primary">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 p-6">
            {isEChartsType ? (
              <ReactECharts
                key={`fs-${config.kind}-${config.colorScheme}-${isUsingRealData}`}
                option={chartOption}
                style={{ width: "100%", height: "100%" }}
                opts={{ renderer: "canvas" }}
                theme="dark"
              />
            ) : config.kind === "stat" ? (
              <StatKPIPreview config={config} realTotal={isUsingRealData ? realData?.total : null} />
            ) : (
              <div className="card h-full overflow-auto p-4">
                <TablePreview config={config} realDocs={isUsingRealData ? realData?.docs.slice(0, config.limit) : null} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
