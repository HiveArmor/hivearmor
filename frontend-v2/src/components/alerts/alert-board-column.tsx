"use client";

import { cn, formatNumber } from "@/lib/utils";
import type { UtmAlert } from "@/types/alert";
import type { AlertStatus } from "@/types/alert";
import { AlertRiskCard } from "./alert-risk-card";

const COL_META: Record<string, {
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
}> = {
  critical: {
    label: "Critical",
    color: "var(--color-critical)",
    borderColor: "border-critical/30",
    bgColor: "bg-critical/5",
  },
  high: {
    label: "High",
    color: "var(--color-high)",
    borderColor: "border-[var(--color-high)]/30",
    bgColor: "bg-[var(--color-high)]/5",
  },
  medium: {
    label: "Medium",
    color: "var(--color-medium)",
    borderColor: "border-[var(--color-medium)]/30",
    bgColor: "bg-[var(--color-medium)]/5",
  },
  low: {
    label: "Low",
    color: "var(--color-low)",
    borderColor: "border-[var(--color-low)]/20",
    bgColor: "bg-[var(--color-low)]/5",
  },
};

interface AlertBoardColumnProps {
  severity: string;
  alerts: UtmAlert[];
  totalCount: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (alert: UtmAlert) => void;
  onStatusChange: (alert: UtmAlert, status: AlertStatus) => void;
  onLaunchSoar: (alert: UtmAlert) => void;
  className?: string;
}

export function AlertBoardColumn({
  severity,
  alerts,
  totalCount,
  selectedIds,
  onToggle,
  onOpen,
  onStatusChange,
  onLaunchSoar,
  className,
}: AlertBoardColumnProps) {
  const meta = COL_META[severity] ?? COL_META.low;
  const pct = totalCount > 0 ? (alerts.length / totalCount) * 100 : 0;

  return (
    <div className={cn(
      "flex flex-col min-h-0 rounded-xl border overflow-hidden",
      meta.borderColor,
      meta.bgColor,
      className
    )}>
      {/* Column header */}
      <div className="px-3 py-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Severity dot */}
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
            />
            <span className="text-small font-semibold text-primary">{meta.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Count badge */}
            <span
              className="px-2 py-0.5 rounded-full text-tiny font-semibold tabular-nums"
              style={{ background: meta.color + "22", color: meta.color }}
            >
              {formatNumber(alerts.length)}
            </span>
          </div>
        </div>

        {/* Risk proportion bar */}
        <div className="h-1 bg-surface-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: meta.color, opacity: 0.7 }}
          />
        </div>
        <p className="text-tiny text-muted">{pct.toFixed(0)}% of total risk surface</p>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2 min-h-0">
        {alerts.length === 0 ? (
          <div className="py-8 text-center">
            <span
              className="text-h2 opacity-20"
              style={{ color: meta.color }}
            >✓</span>
            <p className="text-tiny text-muted mt-1">No {meta.label.toLowerCase()} alerts</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertRiskCard
              key={alert.id}
              alert={alert}
              selected={selectedIds.has(alert.id)}
              onToggle={onToggle}
              onOpen={onOpen}
              onStatusChange={onStatusChange}
              onLaunchSoar={onLaunchSoar}
            />
          ))
        )}
      </div>
    </div>
  );
}
