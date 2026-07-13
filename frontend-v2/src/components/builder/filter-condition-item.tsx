"use client";

import { Trash2 } from "lucide-react";
import { FieldAutocomplete } from "@/components/builder/field-autocomplete";
import type { ElasticFilter, IndexPatternField } from "@/types/visualization-builder";

// ─── Operator Options ────────────────────────────────────────────────────────

const FILTER_OPERATORS: { value: string; label: string }[] = [
  { value: "is", label: "is" },
  { value: "is not", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "does not contain", label: "does not contain" },
  { value: "exists", label: "exists" },
  { value: "does not exist", label: "does not exist" },
  { value: "is between", label: "is between" },
  { value: "is greater than", label: "is greater than" },
  { value: "is less than", label: "is less than" },
];

// Operators that don't require a value input
const VALUE_HIDDEN_OPERATORS = new Set(["exists", "does not exist"]);

// ─── Props ───────────────────────────────────────────────────────────────────

interface FilterConditionItemProps {
  filter: ElasticFilter;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, filter: ElasticFilter) => void;
  onRemove: (index: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FilterConditionItem({
  filter,
  index,
  fields,
  onUpdate,
  onRemove,
}: FilterConditionItemProps) {
  const showValue = !VALUE_HIDDEN_OPERATORS.has(filter.operator);

  const handleFieldChange = (fieldName: string) => {
    onUpdate(index, { ...filter, field: fieldName });
  };

  const handleOperatorChange = (operator: string) => {
    const updated: ElasticFilter = {
      ...filter,
      operator,
      // Clear value when switching to exists/does not exist
      value: VALUE_HIDDEN_OPERATORS.has(operator) ? null : filter.value,
    };
    onUpdate(index, updated);
  };

  const handleValueChange = (value: string) => {
    onUpdate(index, { ...filter, value });
  };

  return (
    <div className="rounded-md border border-surface-border bg-surface-secondary p-3 space-y-2.5">
      {/* Field autocomplete + remove button */}
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] font-medium uppercase text-muted">
            Field
          </label>
          <FieldAutocomplete
            fields={fields}
            value={filter.field || null}
            onChange={handleFieldChange}
            placeholder="Select field..."
          />
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 mt-5"
          title="Remove filter"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Operator select */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium uppercase text-muted">
          Operator
        </label>
        <select
          value={filter.operator}
          onChange={(e) => handleOperatorChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors appearance-none cursor-pointer"
        >
          {FILTER_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </div>

      {/* Value input (hidden for exists / does not exist) */}
      {showValue && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase text-muted">
            Value
          </label>
          <input
            type="text"
            value={(filter.value as string) ?? ""}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Enter value..."
            className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
          />
        </div>
      )}
    </div>
  );
}
