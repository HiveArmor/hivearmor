"use client";

import { useState } from "react";
import {
  MoreHorizontal, Shield, Zap, Eye, Siren, CheckCircle,
  Clock, Globe, ChevronRight,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { SeverityPill } from "@/components/ui/severity-pill";
import { MitreBadge } from "@/components/ui/mitre-badge";
import { Sparkline } from "@/components/ui/sparkline";
import type { UtmAlert } from "@/types/alert";
import { AlertStatus, statusToLabel } from "@/types/alert";

const SEV_ACCENT: Record<string, string> = {
  critical: "var(--color-critical)",
  high:     "var(--color-high)",
  medium:   "var(--color-medium)",
  low:      "var(--color-low)",
  info:     "var(--color-info)",
};

function severityLabel(n: number): string {
  if (n >= 4) return "critical";
  if (n >= 3) return "high";
  if (n >= 2) return "medium";
  if (n >= 1) return "low";
  return "info";
}

interface AlertRiskCardProps {
  alert: UtmAlert;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (alert: UtmAlert) => void;
  onStatusChange: (alert: UtmAlert, status: AlertStatus) => void;
  onLaunchSoar: (alert: UtmAlert) => void;
}

export function AlertRiskCard({
  alert,
  selected,
  onToggle,
  onOpen,
  onStatusChange,
  onLaunchSoar,
}: AlertRiskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sev = severityLabel(alert.severity);
  const accentColor = SEV_ACCENT[sev];

  // Deterministic sparkline seeded from alert id
  const spark = Array.from({ length: 12 }, (_, i) => {
    const h = (alert.id?.charCodeAt?.(i % alert.id.length) ?? 50) % 100;
    return Math.max(10, h);
  });

  const nextStatuses = [AlertStatus.OPEN, AlertStatus.IN_REVIEW, AlertStatus.COMPLETED]
    .filter((s) => s !== alert.status);

  return (
    <div
      className={cn(
        "group relative rounded-lg border transition-all cursor-pointer overflow-hidden",
        "bg-surface-secondary hover:bg-surface-elevated",
        selected
          ? "border-brand shadow-glow"
          : "border-surface-border hover:border-surface-border-focus"
      )}
      onClick={() => onOpen(alert)}
    >
      {/* Severity accent bar — left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
        style={{ background: accentColor }}
      />

      {/* Selection checkbox */}
      <div
        className="absolute top-2.5 right-2.5 z-10"
        onClick={(e) => { e.stopPropagation(); onToggle(alert.id); }}
      >
        <div className={cn(
          "w-4 h-4 rounded border transition-colors flex items-center justify-center",
          selected
            ? "bg-brand border-brand"
            : "border-surface-border bg-transparent opacity-0 group-hover:opacity-100"
        )}>
          {selected && <span className="text-white text-[10px] leading-none">✓</span>}
        </div>
      </div>

      <div className="p-3 pl-4">
        {/* Row 1: severity + name */}
        <div className="flex items-start gap-2 pr-5">
          <SeverityPill
            severity={sev as never}
            pulse={sev === "critical"}
            size="sm"
            className="shrink-0 mt-0.5"
          />
          <span className="flex-1 text-small font-medium text-primary leading-snug line-clamp-2">
            {alert.name}
          </span>
        </div>

        {/* Row 2: metadata chips */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {/* Asset */}
          {(alert.target?.host || alert.target?.ip) && (
            <span className="flex items-center gap-1 font-mono text-tiny text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">
              <Shield className="w-2.5 h-2.5" />
              {alert.target.host ?? alert.target.ip}
            </span>
          )}

          {/* Adversary */}
          {(alert.adversary?.ip || alert.adversary?.host) && (
            <span className="flex items-center gap-1 font-mono text-tiny text-critical bg-critical/15 px-1.5 py-0.5 rounded">
              <Globe className="w-2.5 h-2.5" />
              {alert.adversary.ip ?? alert.adversary.host}
            </span>
          )}

          {/* Echo count */}
          {(alert.echoes ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-tiny text-warning bg-warning/10 px-1.5 py-0.5 rounded">
              <Zap className="w-2.5 h-2.5" />
              ×{alert.echoes}
            </span>
          )}
        </div>

        {/* Row 3: MITRE + sparkline + time */}
        <div className="flex items-center gap-2 mt-2">
          {alert.technique && (
            <MitreBadge
              technique={alert.technique}
              techniqueId={alert.category}
              size="sm"
              className="shrink-0"
            />
          )}
          <div className="flex-1 min-w-0" />
          <Sparkline
            data={spark}
            color={accentColor}
            height={20}
            filled
          />
          <span className="text-tiny text-muted whitespace-nowrap shrink-0">
            {alert.timestamp ? formatRelativeTime(alert.timestamp) : "—"}
          </span>
        </div>

        {/* Row 4: status + action menu */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-surface-border/40">
          {/* Status pill */}
          <span className={cn(
            "flex items-center gap-1 text-tiny px-1.5 py-0.5 rounded-full",
            alert.status === AlertStatus.OPEN       && "bg-critical/10 text-critical",
            alert.status === AlertStatus.IN_REVIEW  && "bg-brand-subtle text-brand",
            alert.status === AlertStatus.COMPLETED  && "bg-success/10 text-success",
          )}>
            {alert.status === AlertStatus.OPEN      && <Clock className="w-2.5 h-2.5" />}
            {alert.status === AlertStatus.IN_REVIEW && <Eye className="w-2.5 h-2.5" />}
            {alert.status === AlertStatus.COMPLETED && <CheckCircle className="w-2.5 h-2.5" />}
            {statusToLabel(alert.status)}
          </span>

          {/* Action menu */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-border transition-colors"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 bottom-full mb-1 z-50 w-44 card shadow-dropdown py-1 animate-scale-in">
                  <button
                    onClick={() => { onOpen(alert); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
                  >
                    <Eye className="w-3.5 h-3.5" /> View details
                  </button>
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => { onStatusChange(alert, s); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
                    >
                      <ChevronRight className="w-3.5 h-3.5" /> {statusToLabel(s)}
                    </button>
                  ))}
                  <div className="border-t border-surface-border/50 mt-1 pt-1">
                    <button
                      onClick={() => { onLaunchSoar(alert); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
                    >
                      <Siren className="w-3.5 h-3.5 text-brand" /> Launch SOAR
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
