"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface ChecklistStepProps {
  stepNumber: number;
  total: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  completed: boolean;
  loading: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function ChecklistStep({
  stepNumber,
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  completed,
  loading,
  onComplete,
  onSkip,
}: ChecklistStepProps) {
  return (
    <div
      className={cn(
        "card border transition-all duration-200",
        completed
          ? "border-success/30 bg-success/5 opacity-70"
          : "border-surface-border hover:border-brand/40"
      )}
    >
      <div className="flex items-start gap-4 p-5">
        {/* Step number / check */}
        <div className="flex-shrink-0 mt-0.5">
          {completed ? (
            <CheckCircle2 className="w-6 h-6 text-success" />
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-surface-border flex items-center justify-center">
              <span className="text-tiny font-bold text-muted">{stepNumber}</span>
            </div>
          )}
        </div>

        {/* Icon + content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-brand", completed && "text-muted")}>{icon}</span>
            <h3 className={cn("text-base font-semibold text-primary", completed && "line-through text-muted")}>
              {title}
            </h3>
          </div>
          <p className="text-small text-muted leading-relaxed">{description}</p>

          {!completed && (
            <div className="flex items-center gap-2 mt-4">
              <Link
                href={actionHref}
                onClick={onComplete}
                className="btn btn-primary btn-sm gap-2"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  icon
                )}
                {actionLabel}
              </Link>
              <button
                onClick={onSkip}
                disabled={loading}
                className="btn btn-secondary btn-sm text-muted hover:text-primary"
              >
                Skip
              </button>
            </div>
          )}
        </div>

        {/* Completed badge */}
        {completed && (
          <span className="flex-shrink-0 text-tiny font-medium text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
            Done
          </span>
        )}
      </div>
    </div>
  );
}
