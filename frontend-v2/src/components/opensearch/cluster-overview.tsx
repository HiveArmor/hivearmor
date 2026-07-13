"use client";

import { useEffect, useState } from "react";
import { Activity, Server, Database, HardDrive, Cpu, AlertTriangle, Loader2 } from "lucide-react";
import { opensearchService, type ClusterHealth, type ClusterStats } from "@/services/opensearch-management.service";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + " TB";
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(1) + " KB";
}

const STATUS_COLOR: Record<string, string> = {
  green:  "text-success bg-success/10 border-success/20",
  yellow: "text-warning bg-warning/10 border-warning/20",
  red:    "text-critical bg-critical/10 border-critical/20",
};

export function ClusterOverview() {
  const [health, setHealth] = useState<ClusterHealth | null>(null);
  const [stats, setStats]   = useState<ClusterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      opensearchService.getClusterHealth(),
      opensearchService.getClusterStats(),
    ]).then(([h, s]) => {
      setHealth(h);
      setStats(s);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading cluster info…
    </div>
  );

  if (error || !health) return (
    <div className="flex items-center justify-center py-12 gap-2 text-small text-warning">
      <AlertTriangle className="w-4 h-4" /> {error ?? "Could not reach OpenSearch"}
    </div>
  );

  const heapPct = stats
    ? Math.round(stats.nodes.jvm.mem.heap_used_in_bytes / stats.nodes.jvm.mem.heap_max_in_bytes * 100)
    : 0;
  const memPct = stats
    ? Math.round((stats.nodes.os.mem.total_in_bytes - stats.nodes.os.mem.free_in_bytes) / stats.nodes.os.mem.total_in_bytes * 100)
    : 0;

  return (
    <div className="space-y-4 p-4">
      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-full border text-small font-semibold capitalize",
          STATUS_COLOR[health.status] ?? "text-muted bg-surface-tertiary border-surface-border"
        )}>
          <span className={cn("w-2 h-2 rounded-full", health.status === "green" ? "bg-success" : health.status === "yellow" ? "bg-warning" : "bg-critical")} />
          {health.status}
        </span>
        <span className="text-small text-muted">{health.cluster_name}</span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: <Server className="w-4 h-4" />,   label: "Nodes",          value: health.number_of_nodes },
          { icon: <Activity className="w-4 h-4" />, label: "Active Shards",  value: health.active_shards },
          { icon: <Database className="w-4 h-4" />, label: "Indices",        value: stats?.indices.count ?? "—" },
          { icon: <HardDrive className="w-4 h-4" />,label: "Store Size",     value: stats ? formatBytes(stats.indices.store.size_in_bytes) : "—" },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted">{kpi.icon}<span className="text-tiny">{kpi.label}</span></div>
            <span className="text-h3 font-bold text-primary tabular-nums">{kpi.value}</span>
          </div>
        ))}
      </div>

      {/* Shard detail */}
      <div className="card p-4 space-y-3">
        <p className="text-small font-semibold text-primary">Shard Distribution</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-small">
          {[
            { label: "Primary",      value: health.active_primary_shards, color: "text-brand" },
            { label: "Relocating",   value: health.relocating_shards,     color: "text-warning" },
            { label: "Initializing", value: health.initializing_shards,   color: "text-secondary" },
            { label: "Unassigned",   value: health.unassigned_shards,      color: health.unassigned_shards > 0 ? "text-critical" : "text-muted" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className="text-tiny text-muted">{s.label}</span>
              <span className={cn("text-h4 font-bold tabular-nums", s.color)}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Resource utilization */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: "JVM Heap", icon: <Cpu className="w-4 h-4" />, pct: heapPct,
              detail: `${formatBytes(stats.nodes.jvm.mem.heap_used_in_bytes)} / ${formatBytes(stats.nodes.jvm.mem.heap_max_in_bytes)}` },
            { label: "OS Memory", icon: <HardDrive className="w-4 h-4" />, pct: memPct,
              detail: `${formatBytes(stats.nodes.os.mem.total_in_bytes - stats.nodes.os.mem.free_in_bytes)} / ${formatBytes(stats.nodes.os.mem.total_in_bytes)}` },
          ].map((r) => (
            <div key={r.label} className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-secondary">{r.icon}<span className="text-small font-medium">{r.label}</span></div>
                <span className={cn("text-small font-bold tabular-nums", r.pct > 85 ? "text-critical" : r.pct > 70 ? "text-warning" : "text-success")}>{r.pct}%</span>
              </div>
              <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", r.pct > 85 ? "bg-critical" : r.pct > 70 ? "bg-warning" : "bg-success")}
                  style={{ width: `${r.pct}%` }} />
              </div>
              <p className="text-tiny text-muted">{r.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
