"use client";

import { cn, formatRelativeTime } from "@/lib/utils";
import type { CriticalAlert } from "@/services/overview.service";
import { SeverityPill } from "@/components/ui/severity-pill";
import { MitreBadge } from "@/components/ui/mitre-badge";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";

interface CriticalAlertsFeedProps {
  data: CriticalAlert[];
  loading?: boolean;
  className?: string;
}

export function CriticalAlertsFeed({ data, loading, className }: CriticalAlertsFeedProps) {
  const unackCount = data.length;

  if (loading) {
    return (
      <div className={cn("card flex flex-col", className)}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="h-4 w-44 shimmer rounded" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-surface-border/40 space-y-2">
            <div className="flex gap-2">
              <div className="h-5 w-16 shimmer rounded-pill" />
              <div className="h-4 flex-1 shimmer rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-3 w-20 shimmer rounded" />
              <div className="h-3 w-24 shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("card flex flex-col", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{
          borderColor: "rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg, rgba(242,53,53,0.04) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
          <span className="text-small font-semibold" style={{ color: "var(--text-primary)" }}>
            Critical Alerts
          </span>
        </div>
        <div className="flex items-center gap-2">
          {unackCount > 0 && (
            <span className="count-badge-critical">
              {unackCount} UNACK
            </span>
          )}
          <Link
            href="/alerts?severity=critical,high"
            className="flex items-center gap-1 text-tiny transition-colors hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {data.length === 0 && (
          <div className="py-12 text-center text-small" style={{ color: "var(--text-muted)" }}>
            No active critical or high alerts
          </div>
        )}
        {data.map((alert) => (
          <Link
            key={alert.id}
            href={`/alerts?id=${alert.id}`}
            className={cn(
              "block px-4 py-3 transition-colors group",
              "border-b",
              "hover:bg-[rgba(242,53,53,0.03)]",
            )}
            style={{
              borderColor: "rgba(255,255,255,0.05)",
              borderLeft: alert.severity === "critical"
                ? "2px solid var(--color-critical)"
                : "2px solid var(--color-high)",
            }}
          >
            {/* Row 1: severity pill + alert name */}
            <div className="flex items-start gap-2">
              <SeverityPill
                severity={alert.severity}
                pulse={alert.severity === "critical"}
                size="sm"
                className="shrink-0 mt-0.5"
              />
              <span
                className="flex-1 text-small font-medium leading-tight line-clamp-1 transition-colors group-hover:text-brand"
                style={{ color: "var(--text-primary)" }}
              >
                {alert.name}
              </span>
              <span
                className="text-micro tabular-nums shrink-0 mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {formatRelativeTime(alert.lastSeen)}
              </span>
              <ChevronRight
                className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)" }}
              />
            </div>

            {/* Row 2: metadata chips */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="font-mono text-tiny px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--surface-tertiary)",
                  color: "var(--text-muted)",
                }}
              >
                {alert.asset}
              </span>
              {alert.tactic && (
                <MitreBadge
                  techniqueId={alert.technique}
                  technique={alert.tactic}
                  size="sm"
                />
              )}
              {alert.count > 1 && (
                <span className="text-tiny" style={{ color: "var(--text-muted)" }}>
                  ×{alert.count.toLocaleString()}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
