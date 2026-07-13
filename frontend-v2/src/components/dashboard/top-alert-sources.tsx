"use client";

import { cn, formatNumber } from "@/lib/utils";
import type { TopSource } from "@/services/overview.service";
import { Sparkline } from "@/components/ui/sparkline";
import { LiveDot } from "@/components/ui/live-dot";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface TopAlertSourcesProps {
  data: TopSource[];
  loading?: boolean;
  className?: string;
}

export function TopAlertSources({ data, loading, className }: TopAlertSourcesProps) {
  if (loading) {
    return (
      <div className={cn("card p-4", className)}>
        <div className="h-4 w-32 shimmer rounded mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-3 w-3 shimmer rounded-full" />
            <div className="h-3 flex-1 shimmer rounded" />
            <div className="h-8 w-20 shimmer rounded" />
            <div className="h-3 w-12 shimmer rounded" />
          </div>
        ))}
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className={cn("card flex flex-col", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span
          className="text-tiny font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
        >
          Top Alert Sources
        </span>
        <Link
          href="/data-sources"
          className="flex items-center gap-1 text-tiny transition-opacity hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          All sources <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Table header */}
        <div
          className="grid grid-cols-[1fr_64px_72px_52px] gap-2 px-4 py-2 border-b"
          style={{
            borderColor: "rgba(255,255,255,0.05)",
            background: "var(--surface-tertiary)",
          }}
        >
          <span className="text-micro uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)", fontSize: "9px" }}>Source</span>
          <span className="text-micro uppercase tracking-widest font-semibold text-right" style={{ color: "var(--text-muted)", fontSize: "9px" }}>Trend</span>
          <span className="text-micro uppercase tracking-widest font-semibold text-right" style={{ color: "var(--text-muted)", fontSize: "9px" }}>Events</span>
          <span className="text-micro uppercase tracking-widest font-semibold text-right" style={{ color: "var(--text-muted)", fontSize: "9px" }}>EPS</span>
        </div>

        {data.map((src, i) => (
          <div
            key={src.name}
            className="grid grid-cols-[1fr_64px_72px_52px] gap-2 items-center px-4 py-2.5 border-b transition-colors"
            style={{
              borderColor: "rgba(255,255,255,0.04)",
            }}
          >
            {/* Source name + status */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-tiny w-4 shrink-0 tabular-nums"
                style={{ color: "var(--text-disabled)" }}
              >
                {i + 1}
              </span>
              <LiveDot status={src.status} size="sm" />
              <div className="min-w-0">
                <p className="text-tiny font-mono truncate" style={{ color: "var(--text-primary)" }}>{src.name}</p>
                <div
                  className="h-1 rounded-full mt-1 overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(src.count / maxCount) * 100}%`,
                      background: src.status === "offline"
                        ? "var(--color-offline)"
                        : src.status === "degraded"
                        ? "var(--color-degraded)"
                        : "var(--brand-primary)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Sparkline */}
            <div className="flex items-center justify-end">
              <Sparkline
                data={src.trend}
                color={
                  src.status === "offline"
                    ? "var(--color-offline)"
                    : src.status === "degraded"
                    ? "var(--color-degraded)"
                    : "var(--brand-primary)"
                }
                height={22}
                filled={false}
              />
            </div>

            {/* Count */}
            <p className="text-tiny tabular-nums text-right" style={{ color: "var(--text-secondary)" }}>
              {formatNumber(src.count)}
            </p>

            {/* EPS */}
            <p className={cn(
              "text-tiny tabular-nums font-semibold text-right",
              src.status === "offline"   && "text-critical",
              src.status === "degraded"  && "text-warning",
              src.status === "ingesting" && "text-success",
            )}>
              {src.eps > 0 ? src.eps : "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
