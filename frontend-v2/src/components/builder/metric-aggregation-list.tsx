"use client";

import { Plus } from "lucide-react";
import { useVisualizationStore } from "@/store/visualization";
import { MetricAggregationItem } from "@/components/builder/metric-aggregation-item";

// ─── Component ───────────────────────────────────────────────────────────────

export function MetricAggregationList() {
  const metrics = useVisualizationStore((s) => s.metrics);
  const fields = useVisualizationStore((s) => s.fields);
  const addMetric = useVisualizationStore((s) => s.addMetric);
  const updateMetric = useVisualizationStore((s) => s.updateMetric);
  const removeMetric = useVisualizationStore((s) => s.removeMetric);

  const canRemove = metrics.length > 1;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-small font-semibold text-primary">Metrics</h3>
        <button
          type="button"
          onClick={addMetric}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Metric items */}
      <div className="space-y-2">
        {metrics.map((metric, index) => (
          <MetricAggregationItem
            key={metric.id}
            metric={metric}
            index={index}
            fields={fields}
            onUpdate={updateMetric}
            onRemove={removeMetric}
            canRemove={canRemove}
          />
        ))}
      </div>
    </div>
  );
}
