"use client";

import { cn } from "@/lib/utils";
import { SearchX } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function EmptyState({ icon, title, description, action, className, size = "md" }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      size === "sm" && "py-8 gap-2",
      size === "md" && "py-16 gap-3",
      size === "lg" && "py-24 gap-4",
      className,
    )}>
      <div className={cn(
        "rounded-xl bg-surface-tertiary text-muted flex items-center justify-center",
        size === "sm" && "w-8 h-8",
        size === "md" && "w-12 h-12",
        size === "lg" && "w-16 h-16",
      )}>
        {icon || <SearchX className={cn(
          size === "sm" && "w-4 h-4",
          size === "md" && "w-6 h-6",
          size === "lg" && "w-8 h-8",
        )} />}
      </div>
      <div className="space-y-1">
        <p className={cn(
          "font-medium text-primary",
          size === "sm" && "text-small",
          size === "md" && "text-body",
          size === "lg" && "text-h3",
        )}>{title}</p>
        {description && (
          <p className={cn("text-muted max-w-sm mx-auto", size === "sm" ? "text-tiny" : "text-small")}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
