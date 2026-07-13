"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { offenseService, Offense } from "@/services/offense.service";
import { MitreBadge } from "@/components/ui/mitre-badge";
import { cn } from "@/lib/utils";
import {
  Shield, ChevronLeft, ChevronRight, RefreshCw,
  ArrowUpDown, ExternalLink,
} from "lucide-react";

// ─── Magnitude bar ─────────────────────────────────────────────────────────
function MagnitudeBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, (value / 10) * 100));
  const color =
    value >= 8 ? "bg-red-500"
    : value >= 5 ? "bg-orange-400"
    : "bg-yellow-400";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        "text-small font-semibold tabular-nums w-4 text-right",
        value >= 8 ? "text-red-400" : value >= 5 ? "text-orange-400" : "text-yellow-400",
      )}>
        {value}
      </span>
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Offense["status"] }) {
  const cfg = {
    open:            { label: "Open",           cls: "bg-red-500/15 text-red-400" },
    closed:          { label: "Closed",         cls: "bg-green-500/15 text-green-400" },
    "false-positive":{ label: "False Positive", cls: "bg-surface-tertiary text-muted" },
  }[status] ?? { label: status, cls: "bg-surface-tertiary text-muted" };

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-small font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── Tab definitions ───────────────────────────────────────────────────────
const TABS = [
  { key: "",               label: "All" },
  { key: "open",           label: "Open" },
  { key: "closed",         label: "Closed" },
  { key: "false-positive", label: "False Positive" },
] as const;

const PAGE_SIZE = 25;

function formatRelative(iso: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function OffensesPage() {
  const nav = useRouter();

  const [offenses, setOffenses]   = useState<Offense[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [activeTab, setActiveTab] = useState<string>("");
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (pg: number, tab: string, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    const res = await offenseService.listOffenses({
      page: pg,
      size: PAGE_SIZE,
      status: tab || undefined,
      sort: "magnitude,desc",
    });
    setOffenses(res.content);
    setTotal(res.total);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(page, activeTab); }, [page, activeTab, load]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand/10">
            <Shield className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-h2 font-semibold text-primary">Offenses</h1>
            <p className="text-small text-muted">Correlated attack campaigns</p>
          </div>
          {!loading && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-surface-tertiary text-small text-muted font-medium">
              {total.toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={() => load(page, activeTab, false)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-small text-muted hover:text-secondary hover:bg-surface-tertiary transition-colors"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-surface-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-md text-small font-medium transition-colors",
              activeTab === tab.key
                ? "bg-brand/10 text-brand"
                : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-1 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-surface-tertiary animate-shimmer" />
            ))}
          </div>
        ) : offenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted">
            <Shield className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-body font-medium">No offenses found</p>
            <p className="text-small mt-1">
              {activeTab ? `No ${activeTab} offenses` : "No offenses in the system yet"}
            </p>
          </div>
        ) : (
          <table className="w-full text-small">
            <thead className="sticky top-0 z-10 bg-surface-primary border-b border-surface-border">
              <tr>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted w-32">
                  <span className="flex items-center gap-1">Magnitude <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted">Name</th>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted w-36">Adversary</th>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted w-20">Alerts</th>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted w-44">Data Types</th>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted w-28">Last Updated</th>
                <th className="px-4 py-2.5 text-left text-tiny font-semibold uppercase tracking-wider text-muted w-32">Status</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50">
              {offenses.map((offense) => (
                <tr
                  key={offense.id}
                  onClick={() => nav.push(`/offenses/${offense.id}`)}
                  className="group hover:bg-surface-tertiary/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <MagnitudeBar value={offense.magnitude} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary group-hover:text-brand transition-colors line-clamp-1">
                      {offense.name}
                    </div>
                    {(offense.technique || offense.category) && (
                      <div className="mt-0.5">
                        <MitreBadge
                          techniqueId={offense.technique}
                          tactic={offense.category}
                          size="sm"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-small text-muted">
                    {offense.adversary?.ip ?? offense.adversary?.user ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted">
                    {offense.alertCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {offense.dataTypes.slice(0, 3).map((dt) => (
                        <span key={dt} className="px-1.5 py-0 rounded text-micro bg-surface-tertiary text-muted font-medium">
                          {dt}
                        </span>
                      ))}
                      {offense.dataTypes.length > 3 && (
                        <span className="px-1.5 py-0 rounded text-micro bg-surface-tertiary text-muted">
                          +{offense.dataTypes.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatRelative(offense.lastUpdate)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={offense.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ExternalLink className="w-3.5 h-3.5 text-muted/40 group-hover:text-muted transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-surface-border shrink-0">
          <span className="text-small text-muted">
            Page {page + 1} of {totalPages} &nbsp;·&nbsp; {total.toLocaleString()} total
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-surface-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-surface-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
