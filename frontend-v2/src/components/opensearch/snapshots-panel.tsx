"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Camera, Trash2, RotateCcw, ChevronDown, Loader2, AlertTriangle,
} from "lucide-react";
import { opensearchService, type Snapshot, type SnapshotRepository } from "@/services/opensearch-management.service";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const STATE_COLOR: Record<string, string> = {
  SUCCESS:      "text-success bg-success/10",
  IN_PROGRESS:  "text-brand bg-brand/10",
  PARTIAL:      "text-warning bg-warning/10",
  FAILED:       "text-critical bg-critical/10",
};

export function SnapshotsPanel() {
  const [repos, setRepos]             = useState<SnapshotRepository>({});
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [snapshots, setSnapshots]     = useState<Snapshot[]>([]);
  const [loading, setLoading]         = useState(true);
  const [snapsLoading, setSnapsLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [working, setWorking]         = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await opensearchService.listRepositories();
      setRepos(data ?? {});
      const first = Object.keys(data ?? {})[0];
      if (first) setSelectedRepo(first);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  useEffect(() => {
    if (!selectedRepo) return;
    setSnapsLoading(true);
    opensearchService.listSnapshots(selectedRepo)
      .then((res) => setSnapshots(res?.snapshots ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load snapshots"))
      .finally(() => setSnapsLoading(false));
  }, [selectedRepo]);

  const handleCreate = async () => {
    if (!selectedRepo) return;
    const name = `manual-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
    setWorking("create");
    try {
      await opensearchService.createSnapshot(selectedRepo, name);
      toast("success", "Snapshot triggered", name);
    } catch (e: unknown) {
      toast("error", "Snapshot failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (snap: string) => {
    if (!selectedRepo) return;
    setWorking(snap);
    try {
      await opensearchService.deleteSnapshot(selectedRepo, snap);
      setSnapshots((prev) => prev.filter((s) => s.snapshot !== snap));
      toast("success", "Snapshot deleted", snap);
    } catch (e: unknown) {
      toast("error", "Delete failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
      setConfirmDelete(null);
    }
  };

  const handleRestore = async (snap: string) => {
    if (!selectedRepo) return;
    setWorking(snap + ":restore");
    try {
      await opensearchService.restoreSnapshot(selectedRepo, snap);
      toast("success", "Restore triggered", snap);
    } catch (e: unknown) {
      toast("error", "Restore failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0 flex-wrap">
        <Camera className="w-4 h-4 text-brand shrink-0" />
        <p className="text-small font-semibold text-primary">Snapshots</p>
        {Object.keys(repos).length > 0 && (
          <div className="relative">
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="input-base text-small pl-3 pr-7 appearance-none"
            >
              {Object.keys(repos).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
          </div>
        )}
        <button
          onClick={handleCreate}
          disabled={!selectedRepo || working !== null}
          className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
        >
          {working === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          Take Snapshot
        </button>
        <button onClick={loadRepos} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 ml-auto disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading repositories…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 gap-2 text-small text-warning">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        ) : Object.keys(repos).length === 0 ? (
          <div className="flex items-center justify-center py-12 text-small text-muted">No snapshot repositories configured.</div>
        ) : snapsLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading snapshots…
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-small text-muted">No snapshots in <span className="font-medium text-secondary mx-1">{selectedRepo}</span>.</div>
        ) : (
          <div className="space-y-2">
            {snapshots.map((s) => (
              <div key={s.snapshot} className="card p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-small font-medium text-primary font-mono">{s.snapshot}</p>
                    <span className={cn("text-tiny font-semibold px-1.5 py-0.5 rounded capitalize", STATE_COLOR[s.state] ?? "text-muted bg-surface-tertiary")}>
                      {s.state}
                    </span>
                  </div>
                  <p className="text-tiny text-muted mt-0.5">
                    Started: {s.start_time}
                    {s.duration_in_millis != null && ` · ${(s.duration_in_millis / 1000).toFixed(1)}s`}
                    {` · ${s.indices.length} indices`}
                    {s.shards && ` · ${s.shards.successful}/${s.shards.total} shards OK`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleRestore(s.snapshot)}
                    disabled={working !== null}
                    title="Restore"
                    className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand/10 disabled:opacity-40 transition-colors"
                  >
                    {working === s.snapshot + ":restore" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  </button>
                  {confirmDelete === s.snapshot ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(s.snapshot)}
                        disabled={working === s.snapshot}
                        className="text-tiny px-2 py-0.5 rounded bg-critical/15 text-critical border border-critical/20 hover:bg-critical/25 disabled:opacity-50"
                      >
                        {working === s.snapshot ? "…" : "Confirm"}
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-tiny px-2 py-0.5 rounded text-muted hover:text-secondary">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(s.snapshot)}
                      disabled={working !== null}
                      title="Delete"
                      className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 disabled:opacity-40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
