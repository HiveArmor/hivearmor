"use client";

import { Bell, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertNewBannerProps {
  count: number;
  onRefresh: () => void;
  onDismiss: () => void;
  className?: string;
}

export function AlertNewBanner({ count, onRefresh, onDismiss, className }: AlertNewBannerProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-lg border",
        "bg-brand/10 border-brand/30 text-small animate-fade-in",
        className
      )}
    >
      <Bell className="w-3.5 h-3.5 text-brand animate-pulse shrink-0" />
      <span className="text-secondary">
        <strong className="text-brand">{count}</strong> new {count === 1 ? "alert" : "alerts"} detected since last refresh
      </span>
      <button
        onClick={onRefresh}
        className="flex items-center gap-1 text-brand hover:text-brand-hover font-medium ml-auto shrink-0 transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Refresh now
      </button>
      <button
        onClick={onDismiss}
        className="text-muted hover:text-primary transition-colors shrink-0"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
