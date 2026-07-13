"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useVisualizationStore } from "@/store/visualization";
import { visualizationService } from "@/services/visualization.service";
import { BuilderHeader } from "@/components/builder/builder-header";
import { ChartRenderer } from "@/components/builder/chart-renderer";
import { MetricAggregationList } from "@/components/builder/metric-aggregation-list";
import { BucketAggregationList } from "@/components/builder/bucket-aggregation-list";
import { FilterPanel } from "@/components/builder/filter-panel";
import { SqlEditorPanel } from "@/components/builder/sql-editor-panel";
import { Settings, BarChart3, Filter } from "lucide-react";

// ─── Component ───────────────────────────────────────────────────────────────

export function BuilderWorkspace() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "preview" | "filters">("preview");

  // Store selectors
  const chartType = useVisualizationStore((s) => s.chartType);
  const metrics = useVisualizationStore((s) => s.metrics);
  const buckets = useVisualizationStore((s) => s.buckets);
  const filters = useVisualizationStore((s) => s.filters);
  const timeRange = useVisualizationStore((s) => s.timeRange);
  const indexPattern = useVisualizationStore((s) => s.indexPattern);
  const queryMode = useVisualizationStore((s) => s.queryMode);
  const sqlQuery = useVisualizationStore((s) => s.sqlQuery);
  const previewData = useVisualizationStore((s) => s.previewData);
  const previewLoading = useVisualizationStore((s) => s.previewLoading);
  const previewError = useVisualizationStore((s) => s.previewError);
  const setPreviewData = useVisualizationStore((s) => s.setPreviewData);
  const setPreviewLoading = useVisualizationStore((s) => s.setPreviewLoading);
  const setPreviewError = useVisualizationStore((s) => s.setPreviewError);

  // Execute preview
  const executePreview = useCallback(async () => {
    const store = useVisualizationStore.getState();

    // Guard: don't run if no index pattern
    if (!store.indexPattern) return;

    // Guard: for DSL mode, need index pattern and at least one metric
    if (store.queryMode === "dsl" && (!store.indexPattern || store.metrics.length === 0)) return;

    // Guard: for SQL mode, must have a non-empty query
    if (store.queryMode === "sql" && !store.sqlQuery.trim()) return;

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const payload = store.toApiPayload();
      const data = await visualizationService.run(payload, store.timeRange);
      setPreviewData(data);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to execute query");
    } finally {
      setPreviewLoading(false);
    }
  }, [setPreviewData, setPreviewLoading, setPreviewError]);

  // Debounced preview execution on config changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      executePreview();
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [metrics, buckets, filters, timeRange, indexPattern, queryMode, sqlQuery, executePreview]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleRetry = () => {
    executePreview();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <BuilderHeader />

      {/* Mobile tab navigation */}
      <div className="md:hidden flex border-b border-surface-border shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("config")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors",
            activeTab === "config"
              ? "text-brand border-b-2 border-brand"
              : "text-muted hover:text-primary"
          )}
        >
          <Settings className="w-3.5 h-3.5" />
          Config
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors",
            activeTab === "preview"
              ? "text-brand border-b-2 border-brand"
              : "text-muted hover:text-primary"
          )}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Preview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("filters")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors",
            activeTab === "filters"
              ? "text-brand border-b-2 border-brand"
              : "text-muted hover:text-primary"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
        </button>
      </div>

      {/* Three-panel grid (desktop) / tabbed (mobile) */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden md:grid h-full" style={{ gridTemplateColumns: "300px 1fr 280px" }}>
          {/* Left panel: Config or SQL */}
          <div className="border-r border-surface-border overflow-y-auto bg-surface-primary">
            {queryMode === "dsl" ? (
              <div className="p-4 space-y-6">
                <MetricAggregationList />
                <div className="border-t border-surface-border" />
                <BucketAggregationList />
              </div>
            ) : (
              <SqlEditorPanel />
            )}
          </div>

          {/* Center panel: Chart preview */}
          <div className="overflow-hidden p-4 bg-surface-secondary flex flex-col">
            <div className="flex-1 min-h-0 rounded-md border border-surface-border bg-surface-primary overflow-hidden">
              <ChartRenderer
                chartType={chartType}
                data={previewData}
                loading={previewLoading}
                error={previewError}
                onRetry={handleRetry}
              />
            </div>
          </div>

          {/* Right panel: Filters */}
          <div className="border-l border-surface-border overflow-hidden bg-surface-primary">
            <FilterPanel />
          </div>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden h-full overflow-hidden">
          {activeTab === "config" && (
            <div className="h-full overflow-y-auto bg-surface-primary">
              {queryMode === "dsl" ? (
                <div className="p-4 space-y-6">
                  <MetricAggregationList />
                  <div className="border-t border-surface-border" />
                  <BucketAggregationList />
                </div>
              ) : (
                <SqlEditorPanel />
              )}
            </div>
          )}

          {activeTab === "preview" && (
            <div className="h-full overflow-hidden p-4 bg-surface-secondary flex flex-col">
              <div className="flex-1 min-h-0 rounded-md border border-surface-border bg-surface-primary overflow-hidden">
                <ChartRenderer
                  chartType={chartType}
                  data={previewData}
                  loading={previewLoading}
                  error={previewError}
                  onRetry={handleRetry}
                />
              </div>
            </div>
          )}

          {activeTab === "filters" && (
            <div className="h-full overflow-hidden bg-surface-primary">
              <FilterPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
