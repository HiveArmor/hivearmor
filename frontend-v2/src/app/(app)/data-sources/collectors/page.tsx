"use client";

import { useCallback, useEffect, useState } from "react";
import { Radio, RefreshCw, Search, Loader2 } from "lucide-react";
import { agentService, type Collector } from "@/services/agent.service";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const STATUS_COLOR: Record<string, string> = {
  ONLINE:  "text-success bg-success/10",
  OFFLINE: "text-critical bg-critical/10",
  UNKNOWN: "text-warning bg-warning/10",
};

export default function CollectorsPage() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agentService.listCollectors(0, 100);
      setCollectors(res.content);
      setTotal(res.totalElements);
    } catch {
      setCollectors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = collectors.filter((c) =>
    c.hostname.toLowerCase().includes(search.toLowerCase()) ||
    (c.ip ?? "").includes(search)
  );

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div>
          <h1 className="text-h3 font-bold text-primary">Collectors</h1>
          <p className="text-tiny text-muted">Cloud and SaaS log collectors</p>
        </div>
        <span className="text-tiny text-muted">{total} total</span>
      </div>

      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by hostname or IP…"
            className="input-base pl-8 w-full text-small"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn btn-sm btn-secondary gap-1.5 ml-auto disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading collectors…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-small text-muted">
            <Radio className="w-8 h-8 opacity-30" />
            <p>{search ? "No collectors match your filter." : "No collectors registered."}</p>
          </div>
        ) : (
          <table className="w-full text-small">
            <thead className="sticky top-0 bg-surface-secondary border-b border-surface-border">
              <tr>
                {["Status", "Hostname", "IP", "Module", "Version", "Last Seen"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-tiny font-semibold text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-b border-surface-border hover:bg-surface-secondary transition-colors">
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      "text-tiny font-semibold px-1.5 py-0.5 rounded",
                      STATUS_COLOR[c.status] ?? STATUS_COLOR.UNKNOWN
                    )}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-primary">{c.hostname}</td>
                  <td className="px-4 py-2.5 font-mono text-tiny text-secondary">{c.ip || "—"}</td>
                  <td className="px-4 py-2.5 text-secondary">{c.module || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{c.version || "—"}</td>
                  <td className="px-4 py-2.5 text-tiny text-muted">
                    {c.lastSeen
                      ? formatDistanceToNow(new Date(c.lastSeen), { addSuffix: true })
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
