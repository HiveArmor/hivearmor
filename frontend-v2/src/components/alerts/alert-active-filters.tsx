"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActiveFilter {
  field: string;
  label: string;
  value: string;
}

interface AlertActiveFiltersProps {
  filters: ActiveFilter[];
  onRemove: (field: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function AlertActiveFilters({
  filters,
  onRemove,
  onClearAll,
  className,
}: AlertActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span className="text-tiny text-muted shrink-0">Filters:</span>
      {filters.map((f) => (
        <span
          key={f.field}
          className="inline-flex items-center gap-1 bg-brand-subtle text-brand text-tiny px-2 py-0.5 rounded-full border border-brand/30"
        >
          <span className="text-muted">{f.label}:</span>
          <span className="font-medium">{f.value}</span>
          <button
            onClick={() => onRemove(f.field)}
            className="ml-0.5 hover:text-primary transition-colors"
            title={`Remove ${f.label} filter`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-tiny text-muted hover:text-primary transition-colors underline underline-offset-2 shrink-0"
      >
        Clear all
      </button>
    </div>
  );
}
