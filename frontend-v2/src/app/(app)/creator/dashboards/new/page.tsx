"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search, Plus, X, Save, Loader2, LayoutDashboard, GripVertical,
  BarChart3, PieChart, LineChart, Activity, Table2, Gauge, ArrowLeft,
  AlertTriangle, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { dashboardService } from "@/services/dashboard.service";
import type { Visualization } from "@/services/dashboard.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayoutItem {
  id: string;        // unique key per canvas item
  vizId: number;
  name: string;
  chartType?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  order: number;
  dvId?: number;     // DashboardVisualization backend ID (when editing)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chartIcon(chartType?: string) {
  const t = (chartType ?? "").toLowerCase();
  if (t.includes("pie")) return <PieChart className="w-4 h-4" />;
  if (t.includes("line") || t.includes("area")) return <LineChart className="w-4 h-4" />;
  if (t.includes("bar")) return <BarChart3 className="w-4 h-4" />;
  if (t.includes("gauge") || t.includes("metric") || t.includes("goal")) return <Gauge className="w-4 h-4" />;
  if (t.includes("table") || t.includes("list")) return <Table2 className="w-4 h-4" />;
  return <Activity className="w-4 h-4" />;
}

function nextPosition(items: LayoutItem[]): { x: number; y: number } {
  if (items.length === 0) return { x: 0, y: 0 };
  const maxY = Math.max(...items.map(i => i.y + i.h));
  return { x: 0, y: maxY };
}

// ─── Widget card on canvas ─────────────────────────────────────────────────────

interface CanvasCardProps {
  item: LayoutItem;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: () => void;
  isDragOver: boolean;
}

function CanvasCard({ item, onRemove, onDragStart, onDragOver, onDrop, isDragOver }: CanvasCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(item.id); }}
      onDrop={onDrop}
      className={cn(
        "card flex flex-col h-full cursor-grab active:cursor-grabbing select-none transition-all",
        isDragOver && "ring-2 ring-brand/60 bg-brand/5"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-border shrink-0">
        <GripVertical className="w-3.5 h-3.5 text-muted shrink-0" />
        <div className="text-muted shrink-0">{chartIcon(item.chartType)}</div>
        <span className="text-small text-primary font-medium truncate flex-1">{item.name}</span>
        {item.chartType && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-surface-tertiary text-muted font-medium shrink-0">
            {item.chartType.replace("_chart", "")}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          className="p-0.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 text-muted">
        <div className="text-center space-y-2">
          {chartIcon(item.chartType)}
          <p className="text-tiny text-muted/60">Widget preview on render page</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get("mode") === "edit";
  const editDashboardId = searchParams.get("dashboardId") ? Number(searchParams.get("dashboardId")) : null;
  const addVizId = searchParams.get("addViz") ? Number(searchParams.get("addViz")) : null;

  // Dashboard metadata
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Widget library
  const [widgets, setWidgets] = useState<Visualization[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [loadingWidgets, setLoadingWidgets] = useState(true);

  // Canvas
  const [layout, setLayout] = useState<LayoutItem[]>([]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(isEditMode);

  // Drag state
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Load widget library
  useEffect(() => {
    setLoadingWidgets(true);
    dashboardService.listVisualizations(0, 200, "name,asc")
      .then(res => setWidgets(res.content))
      .catch(() => toast("error", "Failed to load widget library"))
      .finally(() => setLoadingWidgets(false));
  }, []);

  // Load existing dashboard when editing
  useEffect(() => {
    if (!isEditMode || !editDashboardId) return;
    setLoadingDashboard(true);

    Promise.all([
      dashboardService.getById(editDashboardId),
      dashboardService.getVisualizationsForDashboard(editDashboardId),
    ]).then(([dashboard, dvs]) => {
      if (dashboard) {
        setName(dashboard.name);
        setDescription(dashboard.description ?? "");
      }
      const items: LayoutItem[] = dvs.map((dv, idx) => {
        let grid = { x: 0, y: idx * 4, cols: 6, rows: 4 };
        try { grid = JSON.parse(dv.gridInfo); } catch { /* use default */ }
        return {
          id: `dv-${dv.id}`,
          vizId: dv.idVisualization,
          name: dv.visualization?.name ?? `Widget #${dv.idVisualization}`,
          chartType: dv.visualization?.chartType,
          x: grid.x ?? 0,
          y: grid.y ?? idx * 4,
          w: (grid as { cols?: number }).cols ?? 6,
          h: (grid as { rows?: number }).rows ?? 4,
          order: dv.order ?? idx,
          dvId: dv.id,
        };
      });
      setLayout(items);
    }).catch(() => toast("error", "Failed to load dashboard"))
      .finally(() => setLoadingDashboard(false));
  }, [isEditMode, editDashboardId]);

  // Auto-add widget from ?addViz= param once library loads
  useEffect(() => {
    if (!addVizId || widgets.length === 0) return;
    const viz = widgets.find(w => w.id === addVizId);
    if (!viz) return;
    setLayout(prev => {
      if (prev.some(i => i.vizId === addVizId)) return prev;
      const pos = nextPosition(prev);
      return [...prev, {
        id: `w-${addVizId}-${Date.now()}`,
        vizId: addVizId,
        name: viz.name,
        chartType: viz.chartType,
        x: pos.x,
        y: pos.y,
        w: 6,
        h: 4,
        order: prev.length,
      }];
    });
  }, [addVizId, widgets]);

  const addWidget = useCallback((viz: Visualization) => {
    setLayout(prev => {
      const pos = nextPosition(prev);
      return [...prev, {
        id: `w-${viz.id}-${Date.now()}`,
        vizId: viz.id,
        name: viz.name,
        chartType: viz.chartType,
        x: pos.x,
        y: pos.y,
        w: 6,
        h: 4,
        order: prev.length,
      }];
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setLayout(prev => prev.filter(i => i.id !== id).map((item, idx) => ({ ...item, order: idx })));
  }, []);

  // Drag-to-reorder: swap positions of dragged item and drop target
  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
  }, []);

  const handleDragOver = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleDrop = useCallback(() => {
    const dragId = dragIdRef.current;
    const dropId = dragOverId;
    if (!dragId || !dropId || dragId === dropId) {
      dragIdRef.current = null;
      setDragOverId(null);
      return;
    }
    setLayout(prev => {
      const dragIdx = prev.findIndex(i => i.id === dragId);
      const dropIdx = prev.findIndex(i => i.id === dropId);
      if (dragIdx === -1 || dropIdx === -1) return prev;
      const next = [...prev];
      // Swap the two items
      [next[dragIdx], next[dropIdx]] = [next[dropIdx], next[dragIdx]];
      return next.map((item, idx) => ({ ...item, order: idx }));
    });
    dragIdRef.current = null;
    setDragOverId(null);
  }, [dragOverId]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast("error", "Name required", "Please enter a dashboard name");
      return;
    }
    setSaving(true);
    try {
      if (isEditMode && editDashboardId) {
        // Update existing dashboard
        await dashboardService.update({ id: editDashboardId, name: name.trim(), description: description.trim() });

        // Delete all existing DashboardVisualizations then re-create
        const existing = await dashboardService.getVisualizationsForDashboard(editDashboardId);
        await Promise.all(existing.map(dv => dashboardService.deleteDashboardVisualization(dv.id)));

        await Promise.all(layout.map((item, idx) =>
          dashboardService.createDashboardVisualization({
            idDashboard: editDashboardId,
            idVisualization: item.vizId,
            gridInfo: JSON.stringify({ x: item.x, y: item.y, cols: item.w, rows: item.h }),
            order: idx,
          })
        ));

        toast("success", "Dashboard updated");
        router.push(`/dashboard/render/${editDashboardId}/${encodeURIComponent(name.trim())}`);
      } else {
        // Create new dashboard
        const newDashboard = await dashboardService.create({
          name: name.trim(),
          description: description.trim(),
        });
        if (!newDashboard) throw new Error("Failed to create dashboard");

        await Promise.all(layout.map((item, idx) =>
          dashboardService.createDashboardVisualization({
            idDashboard: newDashboard.id,
            idVisualization: item.vizId,
            gridInfo: JSON.stringify({ x: item.x, y: item.y, cols: item.w, rows: item.h }),
            order: idx,
          })
        ));

        toast("success", "Dashboard created");
        router.push(`/dashboard/render/${newDashboard.id}/${encodeURIComponent(name.trim())}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast("error", "Save failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredWidgets = widgets.filter(w =>
    !librarySearch || w.name.toLowerCase().includes(librarySearch.toLowerCase())
  );

  if (loadingDashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pb-3 shrink-0">
        <button
          onClick={() => router.push("/creator/dashboards")}
          className="toolbar-btn text-muted hover:text-primary"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 grid grid-cols-2 gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Dashboard name *"
            className="input-base w-full"
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="input-base w-full"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => router.push("/creator/dashboards")}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : isEditMode ? "Update Dashboard" : "Save Dashboard"}
          </button>
        </div>
      </div>

      {/* ── Body: widget library + canvas ──────────────────── */}
      <div className="flex flex-1 gap-3 min-h-0">

        {/* ── LEFT: Widget Library (260px) ─────────────────── */}
        <aside className="w-[260px] shrink-0 card overflow-hidden flex flex-col">
          <div className="p-3 border-b border-surface-border shrink-0">
            <p className="text-tiny text-muted uppercase tracking-wider font-medium mb-2">Widget Library</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input
                type="text"
                value={librarySearch}
                onChange={e => setLibrarySearch(e.target.value)}
                placeholder="Search widgets…"
                className="input-base w-full pl-8 py-1.5 text-small"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingWidgets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted" />
              </div>
            ) : filteredWidgets.length === 0 ? (
              <div className="text-center py-8 px-3">
                <BarChart3 className="w-6 h-6 text-muted/50 mx-auto mb-2" />
                <p className="text-small text-muted">
                  {librarySearch ? "No widgets match your search" : "No widgets yet"}
                </p>
                {!librarySearch && (
                  <button
                    onClick={() => router.push("/creator")}
                    className="mt-2 text-tiny text-brand hover:underline"
                  >
                    Create a widget →
                  </button>
                )}
              </div>
            ) : (
              filteredWidgets.map(viz => {
                const alreadyOnCanvas = layout.some(i => i.vizId === viz.id);
                return (
                  <div
                    key={viz.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-surface-border hover:bg-surface-tertiary transition-colors"
                  >
                    <div className="text-muted shrink-0">{chartIcon(viz.chartType)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-small text-primary truncate font-medium">{viz.name}</p>
                      {viz.chartType && (
                        <p className="text-tiny text-muted">{viz.chartType.replace("_chart", "")}</p>
                      )}
                    </div>
                    <button
                      onClick={() => addWidget(viz)}
                      disabled={alreadyOnCanvas}
                      className={cn(
                        "shrink-0 p-1 rounded transition-colors",
                        alreadyOnCanvas
                          ? "text-success cursor-default"
                          : "text-muted hover:text-brand hover:bg-brand/10"
                      )}
                      title={alreadyOnCanvas ? "Already on canvas" : "Add to dashboard"}
                    >
                      {alreadyOnCanvas ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── RIGHT: Canvas ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 card overflow-auto p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {layout.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm">
                <LayoutDashboard className="w-10 h-10 text-muted/40 mx-auto mb-3" />
                <h3 className="text-h3 text-primary mb-1">Empty canvas</h3>
                <p className="text-body text-secondary mb-4">
                  Add widgets from the library panel on the left to build your dashboard.
                </p>
                {widgets.length === 0 && !loadingWidgets && (
                  <button
                    onClick={() => router.push("/creator")}
                    className="btn-primary flex items-center gap-1.5 mx-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Widget First
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-tiny text-muted mb-3">
                {layout.length} widget{layout.length !== 1 ? "s" : ""} · drag to reorder
              </p>
              <div className="grid grid-cols-2 gap-3">
                {layout.map(item => (
                  <div key={item.id} className="h-[180px]">
                    <CanvasCard
                      item={item}
                      onRemove={removeWidget}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      isDragOver={dragOverId === item.id}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Validation banner ──────────────────────────────── */}
      {!name.trim() && layout.length > 0 && (
        <div className="shrink-0 mt-2 flex items-center gap-2 p-2 rounded-lg bg-warning/8 border border-warning/20">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-small text-warning">Enter a dashboard name before saving</p>
        </div>
      )}
    </div>
  );
}
