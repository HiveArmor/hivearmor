"use client";

import { cn, formatRelativeTime } from "@/lib/utils";
import type { CollectorRow } from "@/services/overview.service";
import { Sparkline } from "@/components/ui/sparkline";
import { LiveDot } from "@/components/ui/live-dot";
import Link from "next/link";
import { Settings, ExternalLink } from "lucide-react";

interface CollectorHealthMatrixProps {
  data: CollectorRow[];
  loading?: boolean;
  className?: string;
}

const statusLabel: Record<string, string> = {
  ingesting: "Online",
  degraded:  "Degraded",
  offline:   "Offline",
};

export function CollectorHealthMatrix({ data, loading, className }: CollectorHealthMatrixProps) {
  if (loading) {
    return (
      <div className={cn("card p-4", className)}>
        <div className="h-4 w-40 shimmer rounded mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 shimmer rounded" />
          ))}
        </div>
      </div>
    );
  }

  const online   = data.filter(c => c.status === "ingesting").length;
  const degraded = data.filter(c => c.status === "degraded").length;
  const offline  = data.filter(c => c.status === "offline").length;

  return (
    <div className={cn("card flex flex-col", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-tiny font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
          >
            Data Collector Health
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-tiny" style={{ color: "var(--color-success)" }}>
              <span className="dot-ingesting" /> {online} online
            </span>
            {degraded > 0 && (
              <span className="flex items-center gap-1 text-tiny" style={{ color: "var(--color-degraded)" }}>
                <span className="dot-degraded" /> {degraded} degraded
              </span>
            )}
            {offline > 0 && (
              <span className="flex items-center gap-1 text-tiny" style={{ color: "var(--color-critical)" }}>
                <span className="dot-offline" /> {offline} offline
              </span>
            )}
          </div>
        </div>
        <Link
          href="/data-sources/collectors"
          className="flex items-center gap-1 text-tiny transition-opacity hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          Manage <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full siem-table">
          <thead>
            <tr>
              <th className="w-6">#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th className="text-right">EPS Now</th>
              <th className="text-right">EPS Avg</th>
              <th className="w-24">24h Trend</th>
              <th>Last Event</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((col, i) => (
              <tr
                key={col.id}
                className={cn(
                  col.status === "offline"  && "bg-[var(--color-critical-subtle)]/30",
                  col.status === "degraded" && "bg-[var(--color-medium-subtle)]/20",
                )}
              >
                <td className="text-muted tabular-nums">{i + 1}</td>

                {/* Name */}
                <td>
                  <span className="font-mono text-tiny text-primary">{col.name}</span>
                </td>

                {/* Type */}
                <td>
                  <span className="text-tiny text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">
                    {col.type}
                  </span>
                </td>

                {/* Status */}
                <td>
                  <LiveDot status={col.status} label={statusLabel[col.status]} size="sm" />
                </td>

                {/* EPS now */}
                <td className={cn(
                  "text-right tabular-nums font-medium",
                  col.status === "offline"  && "text-critical",
                  col.status === "degraded" && "text-warning",
                  col.status === "ingesting" && "text-primary",
                )}>
                  {col.eps > 0 ? col.eps.toLocaleString() : "—"}
                </td>

                {/* EPS avg */}
                <td className="text-right tabular-nums text-muted">
                  {col.epsAvg.toLocaleString()}
                </td>

                {/* Trend sparkline */}
                <td>
                  <Sparkline
                    data={col.trend}
                    color={
                      col.status === "offline"   ? "var(--color-offline)"   :
                      col.status === "degraded"  ? "var(--color-degraded)"  :
                      "var(--brand-primary)"
                    }
                    height={24}
                    filled={false}
                  />
                </td>

                {/* Last event */}
                <td className="text-muted whitespace-nowrap">
                  {formatRelativeTime(col.lastEvent)}
                </td>

                {/* Action */}
                <td>
                  <Link
                    href={`/data-sources/collectors?id=${col.id}`}
                    className="btn-icon btn-ghost w-6 h-6"
                  >
                    <Settings className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
