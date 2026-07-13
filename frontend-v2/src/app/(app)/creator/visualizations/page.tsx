"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Download, Upload, Trash2, Pencil, X, BarChart3, CheckSquare, Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { dashboardService } from "@/services/dashboard.service";
import type { Visualization } from "@/services/dashboard.service";
import { format } from "date-fns";

const PAGE_SIZE = 10;

export default function VisualizationsPage() {
  const router = useRouter();
  const [visualizations, setVisualizations] = useState<Visualization[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.listVisualizations(page, PAGE_SIZE, "modifiedDate,desc", searchQuery || undefined);
      setVisualizations(res.content);
      setTotal(res.total);
    } catch {
      toast("error", "Failed to load visualizations");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => {
    try {
      await dashboardService.deleteVisualization(id);
      toast("success", "Widget deleted");
      setDeleteConfirm(null);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      loadData();
    } catch {
      toast("error", "Failed to delete widget");
    }
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(Array.from(selected).map((id) => dashboardService.deleteVisualization(id)));
      toast("success", `${selected.size} widget(s) deleted`);
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      loadData();
    } catch {
      toast("error", "Failed to delete some widgets");
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === visualizations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visualizations.map((v) => v.id)));
    }
  };

  const allSelected = visualizations.length > 0 && selected.size === visualizations.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Widgets</h1>
          <p className="text-secondary text-small mt-0.5">Create and manage dashboard widgets</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => toast("info", "Export not yet implemented")}
              className="btn-secondary flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Export Selected ({selected.size})
            </button>
          )}
          <button className="btn-secondary flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={() => router.push("/creator")}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Widget
          </button>
        </div>
      </div>

      {/* Search + bulk actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search widgets by name..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="input-base w-full pl-9"
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-small text-secondary">{selected.size} selected</span>
            {bulkDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-tiny rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                >
                  Confirm Delete
                </button>
                <button onClick={() => setBulkDeleteConfirm(false)} className="text-muted hover:text-primary">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="btn-secondary flex items-center gap-1.5 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="card">
          <TableSkeleton rows={8} cols={7} />
        </div>
      ) : visualizations.length === 0 ? (
        <div className="card min-h-[40vh] flex items-center justify-center">
          <EmptyState
            icon={<BarChart3 className="w-6 h-6" />}
            title="No widgets found"
            description={searchQuery ? "No widgets match your search" : "Create your first widget to get started"}
            action={
              !searchQuery ? (
                <button
                  onClick={() => router.push("/creator")}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Widget
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-4 py-3 text-left">
                    <button onClick={toggleSelectAll} className="text-muted hover:text-primary transition-colors">
                      {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Chart Type</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Description</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Modified</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">System</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visualizations.map((viz) => (
                  <tr key={viz.id} className={cn(
                    "border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors",
                    selected.has(viz.id) && "bg-brand/5"
                  )}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(viz.id)} className="text-muted hover:text-primary transition-colors">
                        {selected.has(viz.id) ? <CheckSquare className="w-4 h-4 text-brand" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-body text-primary font-medium">{viz.name}</td>
                    <td className="px-4 py-3">
                      {viz.chartType && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-tertiary text-tiny text-secondary font-medium">
                          {viz.chartType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-small text-secondary max-w-[180px] truncate">
                      {viz.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-small text-muted">
                      {viz.modifiedDate ? format(new Date(viz.modifiedDate), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {viz.systemOwner && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand/10 text-brand text-tiny font-medium">
                          System
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => router.push(`/creator/visualizations/${viz.id}/edit`)}
                          className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {deleteConfirm === viz.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(viz.id)}
                              className="px-2 py-0.5 text-tiny rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            >
                              Confirm
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-muted hover:text-primary">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(viz.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
              <span className="text-small text-muted">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className={cn(
                    "px-3 py-1.5 text-small rounded transition-colors",
                    page === 0 ? "text-muted cursor-not-allowed" : "text-secondary hover:bg-surface-tertiary hover:text-primary"
                  )}
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={cn(
                      "w-8 h-8 text-small rounded transition-colors",
                      i === page ? "bg-brand text-white" : "text-secondary hover:bg-surface-tertiary hover:text-primary"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className={cn(
                    "px-3 py-1.5 text-small rounded transition-colors",
                    page >= totalPages - 1 ? "text-muted cursor-not-allowed" : "text-secondary hover:bg-surface-tertiary hover:text-primary"
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
