"use client";

import { Plus } from "lucide-react";
import { useVisualizationStore } from "@/store/visualization";
import { BucketAggregationItem } from "@/components/builder/bucket-aggregation-item";

// ─── Component ───────────────────────────────────────────────────────────────

export function BucketAggregationList() {
  const buckets = useVisualizationStore((s) => s.buckets);
  const fields = useVisualizationStore((s) => s.fields);
  const addBucket = useVisualizationStore((s) => s.addBucket);
  const updateBucket = useVisualizationStore((s) => s.updateBucket);
  const removeBucket = useVisualizationStore((s) => s.removeBucket);
  const addSubBucket = useVisualizationStore((s) => s.addSubBucket);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-small font-semibold text-primary">Buckets</h3>
        <button
          type="button"
          onClick={addBucket}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Bucket items */}
      <div className="space-y-2">
        {buckets.map((bucket, index) => (
          <BucketAggregationItem
            key={bucket.id}
            bucket={bucket}
            index={index}
            fields={fields}
            onUpdate={updateBucket}
            onRemove={removeBucket}
            onAddSubBucket={addSubBucket}
          />
        ))}
      </div>

      {/* Empty state */}
      {buckets.length === 0 && (
        <div className="px-3 py-4 text-center text-small text-muted rounded-md border border-dashed border-surface-border">
          No buckets defined. Add a bucket to group your data.
        </div>
      )}
    </div>
  );
}
