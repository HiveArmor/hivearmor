"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  RefreshCw, FileDown, Clock, BarChart3, PieChart, LineChart,
  Activity, X, Pencil, AlertCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { dashboardService } from "@/services/dashboard.service";
import type { DashboardVisualization } from "@/services/dashboard.service";
import { runWidgetQuery, type WidgetConfig, type TimeRange } from "@/lib/widget-runner";
import type * as echarts from "echarts";

// Lazy-load ECharts to avoid SSR issues
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface GridInfo { x: number; y: number; cols: number; rows: number; }

function parseGridInfo(json: string): GridInfo {
  try { return JSON.parse(json); } catch { return { x: 0, y: 0, cols: 6, rows: 4 }; }
}

function getChartFallbackIcon(chartType?: string) {
  const t = (chartType ?? "").toLowerCase();
  if (t.includes("pie")) return <PieChart className="w-8 h-8" />;
  if (t.includes("line") || t.includes("area")) return <LineChart className="w-8 h-8" />;
  if (t.includes("bar")) return <BarChart3 className="w-8 h-8" />;
  return <Activity className="w-8 h-8" />;
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────

interface WidgetCardProps {
  dv: DashboardVisualization;
  timeRange: TimeRange;
}

function WidgetCard({ dv, timeRange }: WidgetCardProps) {
  const [option, setOption] = useState<echarts.EChartsOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viz = dv.visualization;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOption(null);

    async function run() {
      if (!viz.chartConfig) {
        setLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(viz.chartConfig);

        if (parsed.kind) {
          // New WidgetConfig format — run the query
          const cfg: WidgetConfig = { ...parsed, timeRange };
          const result = await runWidgetQuery(cfg);
          if (!cancelled) {
            setOption(result.option);
          }
        } else {
          // Old Angular format — chartConfig is a raw ECharts option object
          if (!cancelled) {
            setOption(parsed);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Query failed";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [viz.chartConfig, timeRange]);

  const title = viz.name;
  const chartTypeLabel = viz.chartType?.replace("_chart", "") ?? "";

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      {/* Title bar */}
      <div className="px-3 py-2 border-b border-surface-border flex items-center justify-between shrink-0">
        <h4 className="text-small text-primary font-medium truncate">{title}</h4>
        {chartTypeLabel && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-tertiary text-tiny text-muted font-medium shrink-0">
            {chartTypeLabel}
          </span>
        )}
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted" />
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            <p className="text-tiny text-muted max-w-[180px] leading-relaxed">{error}</p>
          </div>
        )}

        {!loading && !error && option && (
          <ReactECharts
            option={option}
            style={{ height: "100%", width: "100%" }}
            theme="dark"
            opts={{ renderer: "canvas" }}
          />
        )}

        {!loading && !error && !option && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted gap-2">
            {getChartFallbackIcon(viz.chartType)}
            <p className="text-tiny text-muted/60">No data for this time range</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export default function DashboardRenderPage() {
  const params = useParams<{ id: string; name: string }>();
  const router = useRouter();
  const dashboardId = Number(params.id);
  const dashboardName = decodeURIComponent(params.name);

  const [visualizations, setVisualizations] = useState<DashboardVisualization[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [filters, setFilters] = useState<Record<string, string>[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.getVisualizationsForDashboard(dashboardId);
      setVisualizations(res);

      // Parse dashboard-level filters if present
      const dashboard = res[0]?.dashboard;
      if (dashboard?.filters) {
        try {
          const parsed = JSON.parse(dashboard.filters);
          if (Array.isArray(parsed)) setFilters(parsed);
        } catch { /* ignore */ }
      }
    } catch {
      toast("error", "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Calculate CSS Grid dimensions from gridInfo
  const gridItems = visualizations.map(dv => ({
    ...dv,
    grid: parseGridInfo(dv.gridInfo),
  }));

  const maxCols = 12;
  const maxRows = Math.max(
    1,
    ...gridItems.map(item => item.grid.y + item.grid.rows)
  );

  // When no gridInfo is set (legacy dashboards), arrange in a responsive 2-col flow
  const hasGridLayout = gridItems.some(item => item.grid.x > 0 || item.grid.y > 0);

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h1">{dashboardName}</h1>
          <p className="text-secondary text-small mt-0.5">
            {visualizations.length > 0
              ? `${visualizations.length} widget${visualizations.length !== 1 ? "s" : ""}`
              : "Dashboard view"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Time range picker */}
          <div className="flex items-center gap-0.5 card px-1 py-1">
            <Clock className="w-3.5 h-3.5 text-muted ml-2 mr-1" />
            {TIME_RANGES.map(tr => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                className={cn(
                  "px-2.5 py-1 text-tiny rounded transition-colors",
                  timeRange === tr.value
                    ? "bg-brand text-white"
                    : "text-secondary hover:text-primary hover:bg-surface-tertiary"
                )}
              >
                {tr.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => router.push(`/creator/dashboards/new?mode=edit&dashboardId=${dashboardId}`)}
            className="btn-secondary flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>

          <button
            onClick={() => toast("info", "PDF export not yet implemented")}
            className="btn-secondary flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            onClick={loadData}
            className="btn-secondary flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filter chips ────────────────────────────────────── */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-tiny text-muted uppercase tracking-wider font-medium">Filters:</span>
          {filters.map((filter, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-tertiary text-small text-secondary"
            >
              {Object.entries(filter).map(([key, val]) => `${key}: ${val}`).join(", ")}
              <X className="w-3 h-3 text-muted" />
            </span>
          ))}
        </div>
      )}

      {/* ── Grid ────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card h-[320px] animate-pulse bg-surface-tertiary/50" />
          ))}
        </div>
      ) : visualizations.length === 0 ? (
        <div className="card min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="w-10 h-10 text-muted mx-auto mb-3" />
            <h3 className="text-h3 text-primary mb-1">No widgets</h3>
            <p className="text-body text-secondary mb-4">This dashboard has no widgets configured</p>
            <button
              onClick={() => router.push(`/creator/dashboards/new?mode=edit&dashboardId=${dashboardId}`)}
              className="btn-primary flex items-center gap-1.5 mx-auto"
            >
              <Pencil className="w-3.5 h-3.5" />
              Add Widgets
            </button>
          </div>
        </div>
      ) : hasGridLayout ? (
        // CSS Grid with position data
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${maxCols}, 1fr)`,
            gridTemplateRows: `repeat(${maxRows}, 80px)`,
          }}
        >
          {gridItems.map(item => (
            <div
              key={item.id}
              style={{
                gridColumn: `${item.grid.x + 1} / span ${item.grid.cols}`,
                gridRow: `${item.grid.y + 1} / span ${item.grid.rows}`,
              }}
            >
              <WidgetCard dv={item} timeRange={timeRange} />
            </div>
          ))}
        </div>
      ) : (
        // Fallback: responsive 2-column grid (for legacy dashboards without gridInfo)
        <div className="grid grid-cols-2 gap-4">
          {gridItems.map(item => (
            <div key={item.id} className="h-[320px]">
              <WidgetCard dv={item} timeRange={timeRange} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
