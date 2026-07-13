"use client";

import { Filter, Plus } from "lucide-react";
import { useVisualizationStore } from "@/store/visualization";
import { TimeRangeFilter } from "@/components/builder/time-range-filter";
import { FilterConditionItem } from "@/components/builder/filter-condition-item";
import type { ElasticFilter } from "@/types/visualization-builder";

// ─── Component ───────────────────────────────────────────────────────────────

export function FilterPanel() {
  const filters = useVisualizationStore((s) => s.filters);
  const fields = useVisualizationStore((s) => s.fields);
  const addFilter = useVisualizationStore((s) => s.addFilter);
  const removeFilter = useVisualizationStore((s) => s.removeFilter);
  const updateFilter = useVisualizationStore((s) => s.updateFilter);

  const handleAddFilter = () => {
    const newFilter: ElasticFilter = {
      field: "",
      operator: "is",
      value: "",
    };
    addFilter(newFilter);
  };

  const handleUpdateFilter = (index: number, filter: ElasticFilter) => {
    updateFilter(index, filter);
  };

  const handleRemoveFilter = (index: number) => {
    removeFilter(index);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border shrink-0">
        <Filter className="w-4 h-4 text-muted" />
        <h3 className="text-small font-semibold text-primary">Filters</h3>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Time range section */}
        <TimeRangeFilter />

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Filter conditions section */}
        <div className="space-y-3">
          {/* Section header + add button */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-muted">
              Conditions
            </span>
            <button
              type="button"
              onClick={handleAddFilter}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add filter
            </button>
          </div>

          {/* Filter condition list */}
          {filters.length === 0 ? (
            <div className="px-3 py-4 text-center text-small text-muted rounded-md border border-dashed border-surface-border">
              No filter conditions added
            </div>
          ) : (
            <div className="space-y-2">
              {filters.map((filter, index) => (
                <FilterConditionItem
                  key={index}
                  filter={filter}
                  index={index}
                  fields={fields}
                  onUpdate={handleUpdateFilter}
                  onRemove={handleRemoveFilter}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
