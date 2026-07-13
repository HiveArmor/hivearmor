"use client";

import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { FieldAutocomplete } from "@/components/builder/field-autocomplete";
import type {
  MetricAggregation,
  MetricType,
  IndexPatternField,
  FieldDataType,
} from "@/types/visualization-builder";
import {
  getMetricRequiresField,
  getFieldTypesForMetric,
} from "@/types/visualization-builder";

// ─── Metric Type Options ─────────────────────────────────────────────────────

const METRIC_TYPE_OPTIONS: { value: MetricType; label: string }[] = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "cardinality", label: "Unique Count" },
  { value: "percentiles", label: "Percentiles" },
  { value: "top_hits", label: "Top Hits" },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface MetricAggregationItemProps {
  metric: MetricAggregation;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, metric: MetricAggregation) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MetricAggregationItem({
  metric,
  index,
  fields,
  onUpdate,
  onRemove,
  canRemove,
}: MetricAggregationItemProps) {
  const requiresField = getMetricRequiresField(metric.type);
  const fieldTypes: FieldDataType[] = getFieldTypesForMetric(metric.type);
  const noIndexPattern = fields.length === 0;

  const handleTypeChange = (newType: MetricType) => {
    const updated: MetricAggregation = {
      ...metric,
      type: newType,
      // Reset field when switching to count or when type category changes
      field: newType === "count" ? null : metric.field,
    };
    onUpdate(index, updated);
  };

  const handleFieldChange = (fieldName: string) => {
    onUpdate(index, { ...metric, field: fieldName || null });
  };

  const handleLabelChange = (label: string) => {
    onUpdate(index, { ...metric, label });
  };

  return (
    <div className="rounded-md border border-surface-border bg-surface-secondary p-3 space-y-3">
      {/* Header row: type select + remove button */}
      <div className="flex items-center gap-2">
        <select
          value={metric.type}
          onChange={(e) => handleTypeChange(e.target.value as MetricType)}
          className="flex-1 px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors appearance-none cursor-pointer"
        >
          {METRIC_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={!canRemove}
          className={cn(
            "p-2 rounded-md transition-colors shrink-0",
            canRemove
              ? "text-muted hover:text-red-400 hover:bg-red-500/10"
              : "text-muted/30 cursor-not-allowed"
          )}
          title={canRemove ? "Remove metric" : "Cannot remove the last metric"}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Field selector (hidden for count) */}
      {requiresField && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase text-muted">
            Field
          </label>
          {noIndexPattern ? (
            <div className="px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-small text-muted opacity-60">
              Select an index pattern first
            </div>
          ) : (
            <FieldAutocomplete
              fields={fields}
              value={metric.field}
              onChange={handleFieldChange}
              filterByType={fieldTypes.length > 0 ? fieldTypes : undefined}
              placeholder="Select field..."
              disabled={noIndexPattern}
            />
          )}
        </div>
      )}

      {/* Custom label */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase text-muted">
          Custom Label
        </label>
        <input
          type="text"
          value={metric.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="Custom label (optional)"
          className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
        />
      </div>
    </div>
  );
}
