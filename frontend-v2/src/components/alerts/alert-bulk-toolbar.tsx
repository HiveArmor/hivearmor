"use client";

import {
  X, Eye, CheckCircle, Siren, Zap, Loader2, ShieldOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertStatus } from "@/types/alert";

interface AlertBulkToolbarProps {
  count: number;
  loading?: boolean;
  onStatusChange: (status: AlertStatus) => void;
  onFalsePositive?: () => void;
  onCreateIncident: () => void;
  onLaunchSoar: () => void;
  onClear: () => void;
}

export function AlertBulkToolbar({
  count,
  loading,
  onStatusChange,
  onFalsePositive,
  onCreateIncident,
  onLaunchSoar,
  onClear,
}: AlertBulkToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-2xl",
        "bg-surface-elevated/95 backdrop-blur-sm border border-surface-border shadow-drawer"
      )}>
        {/* Count badge */}
        <div className="flex items-center gap-2 pr-3 border-r border-surface-border">
          <span className="w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white text-tiny font-bold">
            {count}
          </span>
          <span className="text-small text-primary font-medium">
            {count === 1 ? "alert" : "alerts"} selected
          </span>
        </div>

        {/* Status actions */}
        <button
          onClick={() => onStatusChange(AlertStatus.IN_REVIEW)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
        >
          <Eye className="w-3.5 h-3.5 text-brand" />
          In Review
        </button>

        <button
          onClick={() => onStatusChange(AlertStatus.COMPLETED)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
        >
          <CheckCircle className="w-3.5 h-3.5 text-success" />
          Complete
        </button>

        <button
          onClick={onFalsePositive}
          disabled={loading || !onFalsePositive}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small text-secondary hover:text-warning hover:bg-warning/10 transition-colors disabled:opacity-40"
        >
          <ShieldOff className="w-3.5 h-3.5 text-warning" />
          False Positive
        </button>

        <div className="w-px h-5 bg-surface-border" />

        {/* Create incident */}
        <button
          onClick={onCreateIncident}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small text-secondary hover:text-critical hover:bg-critical/10 transition-colors"
        >
          <Siren className="w-3.5 h-3.5 text-critical" />
          Create Incident
        </button>

        {/* SOAR */}
        <button
          onClick={onLaunchSoar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-small bg-brand text-white hover:bg-brand-hover transition-colors"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Zap className="w-3.5 h-3.5" />
          }
          Launch SOAR
        </button>

        {/* Dismiss */}
        <div className="w-px h-5 bg-surface-border" />
        <button
          onClick={onClear}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
