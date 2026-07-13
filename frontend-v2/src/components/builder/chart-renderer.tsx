"use client";

import { useMemo } from "react";
import { registerTheme } from "echarts";
import ReactECharts from "echarts-for-react";
import { AlertCircle, RefreshCw, BarChart3, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { DARK_CHART_THEME, DARK_CHART_THEME_NAME } from "@/lib/chart-theme";
import { buildChartOptions } from "@/components/builder/chart-config-builder";
import { ChartType, type ChartData } from "@/types/visualization-builder";

// ─── Register dark theme once at module level ────────────────────────────────

registerTheme(DARK_CHART_THEME_NAME, DARK_CHART_THEME);

// ─── Chart types rendered via ECharts ────────────────────────────────────────

const ECHARTS_TYPES: Set<ChartType> = new Set([
  ChartType.LINE,
  ChartType.AREA,
  ChartType.BAR,
  ChartType.BAR_HORIZONTAL,
  ChartType.PIE,
  ChartType.GAUGE,
  ChartType.GOAL,
  ChartType.HEAT_MAP,
]);

// ─── Props ───────────────────────────────────────────────────────────────────

interface ChartRendererProps {
  chartType: ChartType;
  data: ChartData | null;
  loading: boolean;
  error: string | null;
  height?: string;
  onRetry?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChartRenderer({
  chartType,
  data,
  loading,
  error,
  height = "100%",
  onRetry,
}: ChartRendererProps) {
  // Memoize ECharts options to avoid recalculation on every render
  const chartOptions = useMemo(() => {
    if (!data || !ECHARTS_TYPES.has(chartType)) return null;
    return buildChartOptions(chartType, data, [], []);
  }, [chartType, data]);

  const hasData = data && data.series && data.series.length > 0;

  return (
    <div className="relative w-full min-h-[300px]" style={{ height }}>
      {/* Loading overlay */}
      {loading && <LoadingOverlay />}

      {/* Error state */}
      {error && !loading && (
        <ErrorState message={error} onRetry={onRetry} />
      )}

      {/* No-data placeholder */}
      {!error && !loading && !hasData && <NoDataPlaceholder />}

      {/* Chart content */}
      {!error && hasData && (
        <div className={cn("w-full h-full", loading && "opacity-40 pointer-events-none")}>
          {ECHARTS_TYPES.has(chartType) && chartOptions ? (
            <ReactECharts
              option={chartOptions}
              theme={DARK_CHART_THEME_NAME}
              style={{ width: "100%", height: "100%" }}
              opts={{ renderer: "canvas" }}
              notMerge={true}
            />
          ) : (
            <CustomRenderer chartType={chartType} data={data} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading Overlay ─────────────────────────────────────────────────────────

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-primary/60 backdrop-blur-[1px] rounded-md">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
        <span className="text-small text-muted">Loading data...</span>
      </div>
    </div>
  );
}

// ─── Error State ─────────────────────────────────────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-small text-muted max-w-xs">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-small text-brand hover:bg-brand/10 border border-brand/30 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── No Data Placeholder ─────────────────────────────────────────────────────

function NoDataPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center px-6">
        <BarChart3 className="w-8 h-8 text-muted/50" />
        <p className="text-small text-muted">No data</p>
        <p className="text-[11px] text-muted/70">
          Adjust your query or time range to see results
        </p>
      </div>
    </div>
  );
}

// ─── Custom Renderer (Metric, Table, List, Text) ─────────────────────────────

function CustomRenderer({
  chartType,
  data,
}: {
  chartType: ChartType;
  data: ChartData;
}) {
  switch (chartType) {
    case ChartType.METRIC:
      return <MetricRenderer data={data} />;
    case ChartType.TABLE:
      return <TableRenderer data={data} />;
    case ChartType.LIST:
      return <ListRenderer data={data} />;
    case ChartType.TEXT:
      return <TextRenderer data={data} />;
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-small text-muted">
            Unsupported chart type
          </p>
        </div>
      );
  }
}

// ─── Metric Renderer ─────────────────────────────────────────────────────────

function MetricRenderer({ data }: { data: ChartData }) {
  const value = useMemo(() => {
    const firstSeries = data.series[0];
    if (!firstSeries || firstSeries.data.length === 0) return 0;
    const firstItem = firstSeries.data[0];
    return typeof firstItem === "number" ? firstItem : firstItem.value;
  }, [data]);

  const label = data.series[0]?.name ?? "Metric";

  const formattedValue = useMemo(() => {
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  }, [value]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <span className="text-5xl font-bold text-primary tabular-nums">
        {formattedValue}
      </span>
      <span className="text-small text-muted">{label}</span>
    </div>
  );
}

// ─── Table Renderer ──────────────────────────────────────────────────────────

function TableRenderer({ data }: { data: ChartData }) {
  const { headers, rows } = useMemo(() => {
    const categoryHeader = data.categories ? "Category" : null;
    const seriesHeaders = data.series.map((s) => s.name);
    const allHeaders = categoryHeader
      ? [categoryHeader, ...seriesHeaders]
      : seriesHeaders;

    const rowCount = data.series[0]?.data.length ?? 0;
    const tableRows: (string | number)[][] = [];

    for (let i = 0; i < rowCount; i++) {
      const row: (string | number)[] = [];
      if (data.categories) {
        row.push(data.categories[i] ?? "");
      }
      for (const series of data.series) {
        const item = series.data[i];
        if (item === undefined) {
          row.push("");
        } else if (typeof item === "number") {
          row.push(item);
        } else {
          row.push(item.value);
        }
      }
      tableRows.push(row);
    }

    return { headers: allHeaders, rows: tableRows };
  }, [data]);

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-small border-collapse">
        <thead>
          <tr className="border-b border-surface-border">
            {headers.map((header, idx) => (
              <th
                key={idx}
                className="px-3 py-2 text-left text-[11px] font-medium uppercase text-muted bg-surface-secondary"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-surface-border/50 hover:bg-surface-secondary/50 transition-colors"
            >
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-3 py-2 text-primary">
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

// ─── List Renderer ───────────────────────────────────────────────────────────

function ListRenderer({ data }: { data: ChartData }) {
  const items = useMemo(() => {
    const firstSeries = data.series[0];
    if (!firstSeries) return [];

    return firstSeries.data.map((item, idx) => {
      if (typeof item === "number") {
        const name = data.categories?.[idx] ?? `Item ${idx + 1}`;
        return { name, value: item };
      }
      return { name: item.name, value: item.value };
    });
  }, [data]);

  return (
    <div className="w-full h-full overflow-auto p-4">
      <ol className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-secondary border border-surface-border"
          >
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted w-5 text-right">
                {idx + 1}.
              </span>
              <span className="text-small text-primary">{item.name}</span>
            </span>
            <span className="text-small font-medium text-brand tabular-nums">
              {item.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Text Renderer ───────────────────────────────────────────────────────────

function TextRenderer({ data }: { data: ChartData }) {
  const textContent = useMemo(() => {
    // Text chart uses the first series name or first data item as content
    const firstSeries = data.series[0];
    if (!firstSeries) return "";

    // If data contains named items, join their names
    if (firstSeries.data.length > 0) {
      const firstItem = firstSeries.data[0];
      if (typeof firstItem === "object" && firstItem.name) {
        return firstSeries.data
          .map((item) => (typeof item === "object" ? item.name : String(item)))
          .join("\n");
      }
    }

    // Fall back to series name or categories
    if (data.categories && data.categories.length > 0) {
      return data.categories.join("\n");
    }

    return firstSeries.name;
  }, [data]);

  return (
    <div className="w-full h-full overflow-auto p-6">
      <div className="text-primary text-small whitespace-pre-wrap leading-relaxed">
        {textContent}
      </div>
    </div>
  );
}
