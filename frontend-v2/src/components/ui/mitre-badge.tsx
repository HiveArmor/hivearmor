"use client";

import { cn } from "@/lib/utils";

interface MitreBadgeProps {
  tactic?: string;
  technique?: string;
  techniqueId?: string;
  size?: "sm" | "md";
  className?: string;
}

export function MitreBadge({ tactic, technique, techniqueId, size = "md", className }: MitreBadgeProps) {
  if (!tactic && !technique) return null;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded border font-mono",
      "bg-brand-secondary-subtle border-brand-secondary/20 text-[var(--brand-secondary)]",
      size === "md" ? "px-2 py-0.5 text-tiny" : "px-1.5 py-0 text-micro",
      className,
    )}>
      {techniqueId && <span className="font-semibold">{techniqueId}</span>}
      {technique && <span>{technique}</span>}
      {!technique && tactic && <span>{tactic}</span>}
    </span>
  );
}
