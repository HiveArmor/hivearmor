"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Download, Trash2, Eye, Pencil, Copy, X, LayoutDashboard, Shield,
  Pin, PinOff, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { dashboardService } from "@/services/dashboard.service";
import type { Dashboard } from "@/services/dashboard.service";
import { useIsAdmin } from "@/hooks/use-current-user";
import { format } from "date-fns";

const PAGE_SIZE = 10;

export default function DashboardsPage() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [pinning, setPinning] = useState<number | null>(null);

  // Drag-reorder state (admin only, pinned rows only)
  const dragId   = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dashboardService.list(page, PAGE_SIZE, "modifiedDate,desc", searchQuery || undefined);
      setDashboards(res.content);
      setTotal(res.total);
    } catch {
      toast("error", "Failed to load dashboards");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => {
    try {
      await dashboardService.delete(id);
      toast("success", "Dashboard deleted");
      setDeleteConfirm(null);
      loadData();
    } catch {
      toast("error", "Failed to delete dashboard");
    }
  };

  const handleCopyUrl = (id: number, name: string) => {
    const url = `${window.location.origin}/dashboard/render/${id}/${encodeURIComponent(name)}`;
    navigator.clipboard.writeText(url);
    toast("success", "URL copied to clipboard");
  };

  const handleTogglePin = async (dashboard: Dashboard) => {
    setPinning(dashboard.id);
    try {
      await dashboardService.update({
        ...dashboard,
        sidebarPinned: !dashboard.sidebarPinned,
        // assign a trailing order when pinning so it goes to end
        sidebarOrder: dashboard.sidebarPinned ? dashboard.sidebarOrder : 99999,
      });
      toast("success", dashboard.sidebarPinned ? "Removed from sidebar" : "Pinned to sidebar");
      await loadData();
    } catch {
      toast("error", "Failed to update sidebar pin");
    } finally {
      setPinning(null);
    }
  };

  // ── Drag-to-reorder (pinned rows) ─────────────────────────────────────────
  const handleDragStart = (id: number) => { dragId.current = id; };
  const handleDragOver  = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    setDragOver(id);
  };
  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    setDragOver(null);
    const sourceId = dragId.current;
    if (!sourceId || sourceId === targetId) return;

    // Reorder pinned dashboards optimistically
    const pinned = dashboards
      .filter((d) => d.sidebarPinned)
      .sort((a, b) => (a.sidebarOrder ?? 0) - (b.sidebarOrder ?? 0));

    const sourceIdx = pinned.findIndex((d) => d.id === sourceId);
    const targetIdx = pinned.findIndex((d) => d.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...pinned];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const orderItems = reordered.map((d, i) => ({ id: d.id, sidebarOrder: i }));

    // Optimistic local update
    setDashboards((prev) =>
      prev.map((d) => {
        const updated = orderItems.find((o) => o.id === d.id);
        return updated ? { ...d, sidebarOrder: updated.sidebarOrder } : d;
      })
    );

    try {
      await dashboardService.updateSidebarOrder(orderItems);
    } catch {
      toast("error", "Failed to save order");
      await loadData();
    }
  };
  const handleDragEnd = () => { dragId.current = null; setDragOver(null); };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Dashboards</h1>
          <p className="text-secondary text-small mt-0.5">Create and manage custom dashboards</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Import
          </button>
          <button
            onClick={() => router.push("/creator/dashboards/new")}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Dashboard
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder="Search dashboards by name..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
          className="input-base w-full pl-9"
        />
      </div>

      {isAdmin && (
        <p className="text-tiny text-muted">
          <Pin className="w-3 h-3 inline mr-1 -mt-0.5" />
          Pin dashboards to the sidebar. Drag pinned rows to reorder them.
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="card">
          <TableSkeleton rows={8} cols={isAdmin ? 7 : 6} />
        </div>
      ) : dashboards.length === 0 ? (
        <div className="card min-h-[40vh] flex items-center justify-center">
          <EmptyState
            icon={<LayoutDashboard className="w-6 h-6" />}
            title="No dashboards found"
            description={searchQuery ? "No dashboards match your search" : "Create your first dashboard to get started"}
            action={
              !searchQuery ? (
                <button
                  onClick={() => router.push("/creator/dashboards/new")}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Dashboard
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
                  {isAdmin && <th className="w-8 px-2 py-3" />}
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Name</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Description</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Created</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Modified</th>
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">System</th>
                  {isAdmin && (
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Sidebar</th>
                  )}
                  <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dashboards.map((dashboard) => {
                  const isPinned  = !!dashboard.sidebarPinned;
                  const isDragTarget = dragOver === dashboard.id;

                  return (
                    <tr
                      key={dashboard.id}
                      className={cn(
                        "border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors",
                        isDragTarget && "bg-brand/5 border-brand/30",
                      )}
                      draggable={isAdmin && isPinned}
                      onDragStart={() => isAdmin && isPinned && handleDragStart(dashboard.id)}
                      onDragOver={(e) => isAdmin && isPinned && handleDragOver(e, dashboard.id)}
                      onDrop={(e) => isAdmin && isPinned && handleDrop(e, dashboard.id)}
                      onDragEnd={handleDragEnd}
                    >
                      {/* Drag handle — only pinned rows get one */}
                      {isAdmin && (
                        <td className="px-2 py-3 w-8">
                          {isPinned && (
                            <GripVertical className="w-4 h-4 text-muted/50 cursor-grab active:cursor-grabbing" />
                          )}
                        </td>
                      )}

                      <td className="px-4 py-3 text-body text-primary font-medium">{dashboard.name}</td>
                      <td className="px-4 py-3 text-small text-secondary max-w-[200px] truncate">
                        {dashboard.description || "—"}
                      </td>
                      <td className="px-4 py-3 text-small text-muted">
                        {dashboard.createdDate ? format(new Date(dashboard.createdDate), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-small text-muted">
                        {dashboard.modifiedDate ? format(new Date(dashboard.modifiedDate), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {dashboard.systemOwner && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-tiny font-medium">
                            <Shield className="w-3 h-3" />
                            System
                          </span>
                        )}
                      </td>

                      {/* Pin toggle — admin only */}
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleTogglePin(dashboard)}
                            disabled={pinning === dashboard.id}
                            title={isPinned ? "Remove from sidebar" : "Pin to sidebar"}
                            className={cn(
                              "p-1.5 rounded transition-colors",
                              isPinned
                                ? "text-brand hover:bg-brand/10"
                                : "text-muted/40 hover:text-brand hover:bg-brand/10",
                              pinning === dashboard.id && "opacity-50 cursor-not-allowed",
                            )}
                          >
                            {isPinned
                              ? <Pin    className="w-3.5 h-3.5" />
                              : <PinOff className="w-3.5 h-3.5" />
                            }
                          </button>
                        </td>
                      )}

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => router.push(`/dashboard/render/${dashboard.id}/${encodeURIComponent(dashboard.name)}`)}
                            className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => router.push(`/creator/dashboards/new?mode=edit&dashboardId=${dashboard.id}`)}
                            className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCopyUrl(dashboard.id, dashboard.name)}
                            className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
                            title="Copy URL"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirm === dashboard.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(dashboard.id)}
                                className="px-2 py-0.5 text-tiny rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-muted hover:text-primary"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(dashboard.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
