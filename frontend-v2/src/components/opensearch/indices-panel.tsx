"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search, RefreshCw, Trash2, GitMerge, ChevronRight, Loader2, AlertTriangle,
} from "lucide-react";
import { opensearchService, type IndexInfo } from "@/services/opensearch-management.service";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const HEALTH_DOT: Record<string, string> = {
  green:  "bg-success",
  yellow: "bg-warning",
  red:    "bg-critical",
};

function formatBytes(b: string): string {
  const n = Number(b);
  if (Number.isNaN(n)) return b;
  if (n >= 1e12) return (n / 1e12).toFixed(1) + " TB";
  if (n >= 1e9)  return (n / 1e9).toFixed(1)  + " GB";
  if (n >= 1e6)  return (n / 1e6).toFixed(1)  + " MB";
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + " KB";
  return n + " B";
}

export function IndicesPanel() {
  const [indices, setIndices]     = useState<IndexInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [working, setWorking]     = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await opensearchService.listIndices();
      setIndices(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load indices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = indices.filter((i) =>
    i.index.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.index.localeCompare(b.index));

  const handleDelete = async (index: string) => {
    setWorking(index);
    try {
      await opensearchService.deleteIndex(index);
      setIndices((prev) => prev.filter((i) => i.index !== index));
      toast("success", "Index deleted", index);
    } catch (e: unknown) {
      toast("error", "Delete failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
      setConfirmDelete(null);
    }
  };

  const handleForceMerge = async (index: string) => {
    setWorking(index + ":merge");
    try {
      await opensearchService.forceMerge(index);
      toast("success", "Force merge triggered", index);
    } catch (e: unknown) {
      toast("error", "Force merge failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
    }
  };

  const handleRefresh = async (index: string) => {
    setWorking(index + ":refresh");
    try {
      await opensearchService.refreshIndex(index);
      toast("success", "Refresh triggered", index);
    } catch (e: unknown) {
      toast("error", "Refresh failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter indices…"
            className="input-base pl-8 w-full text-small"
          />
        </div>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
        <span className="text-tiny text-muted ml-auto">{visible.length} indices</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading && indices.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading indices…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 gap-2 text-small text-warning">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        ) : (
          <table className="w-full text-small">
            <thead className="sticky top-0 bg-surface-secondary border-b border-surface-border">
              <tr>
                {["Index", "Health", "Docs", "Size", "Shards", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-tiny font-semibold text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((idx) => (
                <>
                  <tr key={idx.index}
                    className="border-b border-surface-border hover:bg-surface-secondary transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === idx.index ? null : idx.index)}>
                    <td className="px-4 py-2.5 font-mono text-tiny text-primary flex items-center gap-1.5">
                      <ChevronRight className={cn("w-3 h-3 text-muted transition-transform shrink-0", expanded === idx.index && "rotate-90")} />
                      {idx.index}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", HEALTH_DOT[idx.health] ?? "bg-muted")} />
                        <span className="text-tiny capitalize text-secondary">{idx.health}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-secondary">{Number(idx["docs.count"]).toLocaleString()}</td>
                    <td className="px-4 py-2.5 tabular-nums text-secondary">{formatBytes(idx["store.size"])}</td>
                    <td className="px-4 py-2.5 tabular-nums text-secondary">{idx.pri}p / {idx.rep}r</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRefresh(idx.index)}
                          disabled={working !== null}
                          title="Refresh"
                          className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand/10 disabled:opacity-40 transition-colors"
                        >
                          {working === idx.index + ":refresh" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => handleForceMerge(idx.index)}
                          disabled={working !== null}
                          title="Force Merge"
                          className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand/10 disabled:opacity-40 transition-colors"
                        >
                          {working === idx.index + ":merge" ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                        </button>
                        {confirmDelete === idx.index ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(idx.index)}
                              disabled={working === idx.index}
                              className="text-tiny px-2 py-0.5 rounded bg-critical/15 text-critical border border-critical/20 hover:bg-critical/25 disabled:opacity-50"
                            >
                              {working === idx.index ? "…" : "Confirm"}
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="text-tiny px-2 py-0.5 rounded text-muted hover:text-secondary">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(idx.index)}
                            disabled={working !== null}
                            title="Delete"
                            className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === idx.index && (
                    <tr key={idx.index + "-detail"} className="bg-surface-secondary border-b border-surface-border">
                      <td colSpan={6} className="px-8 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-tiny">
                          <div><span className="text-muted">Status:</span> <span className="text-secondary capitalize">{idx.status}</span></div>
                          <div><span className="text-muted">Created:</span> <span className="text-secondary">{idx["creation.date.string"]}</span></div>
                          <div><span className="text-muted">Primary shards:</span> <span className="text-secondary">{idx.pri}</span></div>
                          <div><span className="text-muted">Replica shards:</span> <span className="text-secondary">{idx.rep}</span></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
