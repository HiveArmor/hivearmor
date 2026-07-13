"use client";

import { cn } from "@/lib/utils";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

interface SeverityPillProps {
  severity: Severity;
  count?: number;
  pulse?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const config: Record<Severity, {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
  glow?: string;
}> = {
  critical: {
    label: "Critical",
    dot:   "bg-[var(--color-critical)]",
    text:  "text-[var(--color-critical)]",
    bg:    "bg-[var(--color-critical-subtle)]",
    border: "border-[var(--color-critical)]/20",
    glow:   "shadow-glow-critical",
  },
  high: {
    label: "High",
    dot:   "bg-[var(--color-high)]",
    text:  "text-[var(--color-high)]",
    bg:    "bg-[var(--color-high-subtle)]",
    border: "border-[var(--color-high)]/20",
  },
  medium: {
    label: "Medium",
    dot:   "bg-[var(--color-medium)]",
    text:  "text-[var(--color-medium)]",
    bg:    "bg-[var(--color-medium-subtle)]",
    border: "border-[var(--color-medium)]/20",
  },
  low: {
    label: "Low",
    dot:   "bg-[var(--color-low)]",
    text:  "text-[var(--color-low)]",
    bg:    "bg-[var(--color-low-subtle)]",
    border: "border-[var(--color-low)]/20",
  },
  info: {
    label: "Info",
    dot:   "bg-[var(--color-info)]",
    text:  "text-[var(--color-info)]",
    bg:    "bg-[var(--color-info-subtle)]",
    border: "border-[var(--color-info)]/20",
  },
};

export function SeverityPill({ severity, count, pulse, size = "md", className }: SeverityPillProps) {
  const c = config[severity];

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-pill border font-medium",
      c.bg, c.text, c.border,
      size === "md" ? "px-2.5 py-0.5 text-small" : "px-2 py-0 text-tiny",
      severity === "critical" && c.glow,
      className,
    )}>
      <span className={cn(
        "rounded-full shrink-0",
        size === "md" ? "w-1.5 h-1.5" : "w-1 h-1",
        c.dot,
        pulse && severity === "critical" && "animate-data-pulse",
      )} />
      {c.label}
      {count !== undefined && (
        <span className={cn("font-semibold tabular-nums", size === "md" ? "text-small" : "text-tiny")}>
          {count}
        </span>
      )}
    </span>
  );
}
