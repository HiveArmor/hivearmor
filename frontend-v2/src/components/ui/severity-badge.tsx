"use client";

import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

const severityConfig: Record<Severity, { label: string; bg: string; text: string; dot: string }> = {
  critical: { label: "Critical", bg: "bg-red-500/15", text: "text-severity-critical", dot: "bg-severity-critical" },
  high: { label: "High", bg: "bg-orange-500/15", text: "text-severity-high", dot: "bg-severity-high" },
  medium: { label: "Medium", bg: "bg-yellow-500/15", text: "text-severity-medium", dot: "bg-severity-medium" },
  low: { label: "Low", bg: "bg-green-500/15", text: "text-severity-low", dot: "bg-severity-low" },
  info: { label: "Info", bg: "bg-cyan-500/15", text: "text-severity-info", dot: "bg-severity-info" },
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = severityConfig[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-small font-medium", config.bg, config.text, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
