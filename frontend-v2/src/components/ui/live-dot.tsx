"use client";

import { cn } from "@/lib/utils";

type LiveStatus = "ingesting" | "degraded" | "offline" | "unknown";

interface LiveDotProps {
  status: LiveStatus;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

export function LiveDot({ status, size = "md", pulse = true, label, className }: LiveDotProps) {
  const dotClass = cn(
    "rounded-full shrink-0",
    sizeMap[size],
    status === "ingesting" && "dot-ingesting",
    status === "degraded"  && "dot-degraded",
    status === "offline"   && "dot-offline",
    status === "unknown"   && "bg-surface-border-strong",
    pulse && status === "ingesting" && "animate-live-glow",
    pulse && status === "offline"   && "animate-data-pulse",
    className,
  );

  if (label) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={dotClass} />
        <span className={cn(
          "text-tiny",
          status === "ingesting" && "text-success",
          status === "degraded"  && "text-warning",
          status === "offline"   && "text-critical",
          status === "unknown"   && "text-muted",
        )}>
          {label}
        </span>
      </span>
    );
  }

  return <span className={dotClass} />;
}
