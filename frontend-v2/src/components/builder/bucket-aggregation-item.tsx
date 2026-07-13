"use client";

import { cn } from "@/lib/utils";
import { Trash2, Plus, X } from "lucide-react";
import { FieldAutocomplete } from "@/components/builder/field-autocomplete";
import type {
  BucketAggregation,
  BucketType,
  IndexPatternField,
  FieldDataType,
  TermsParams,
  DateHistogramParams,
  HistogramParams,
  RangeParams,
  FiltersParams,
  ElasticFilter,
} from "@/types/visualization-builder";
import { getFieldTypesForBucket } from "@/types/visualization-builder";

// ─── Bucket Type Options ─────────────────────────────────────────────────────

const BUCKET_TYPE_OPTIONS: { value: BucketType; label: string }[] = [
  { value: "terms", label: "Terms" },
  { value: "date_histogram", label: "Date Histogram" },
  { value: "histogram", label: "Histogram" },
  { value: "range", label: "Range" },
  { value: "filters", label: "Filters" },
];

const DATE_HISTOGRAM_INTERVALS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1s", label: "Second" },
  { value: "1m", label: "Minute" },
  { value: "1h", label: "Hourly" },
  { value: "1d", label: "Daily" },
  { value: "1w", label: "Weekly" },
  { value: "1M", label: "Monthly" },
  { value: "1y", label: "Yearly" },
];

const TERMS_ORDER_OPTIONS: { value: string; label: string }[] = [
  { value: "_count:desc", label: "Count (desc)" },
  { value: "_count:asc", label: "Count (asc)" },
  { value: "_key:desc", label: "Term (desc)" },
  { value: "_key:asc", label: "Term (asc)" },
];

// ─── Helper: Default params for each type ────────────────────────────────────

function getDefaultParams(type: BucketType): TermsParams | DateHistogramParams | HistogramParams | RangeParams | FiltersParams {
  switch (type) {
    case "terms":
      return { size: 5, order: { field: "_count", direction: "desc" } } as TermsParams;
    case "date_histogram":
      return { interval: "auto" } as DateHistogramParams;
    case "histogram":
      return { interval: 10 } as HistogramParams;
    case "range":
      return { ranges: [{ from: 0, to: 100 }] } as RangeParams;
    case "filters":
      return { filters: [{ label: "Filter 1", filter: { field: "", operator: "is", value: "" } }] } as FiltersParams;
    default:
      return { size: 5, order: { field: "_count", direction: "desc" } } as TermsParams;
  }
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface BucketAggregationItemProps {
  bucket: BucketAggregation;
  index: number;
  fields: IndexPatternField[];
  onUpdate: (index: number, bucket: BucketAggregation) => void;
  onRemove: (index: number) => void;
  onAddSubBucket: (parentIndex: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BucketAggregationItem({
  bucket,
  index,
  fields,
  onUpdate,
  onRemove,
  onAddSubBucket,
}: BucketAggregationItemProps) {
  const fieldTypes: FieldDataType[] = getFieldTypesForBucket(bucket.type);
  const requiresField = bucket.type !== "filters";
  const noIndexPattern = fields.length === 0;

  const handleTypeChange = (newType: BucketType) => {
    const updated: BucketAggregation = {
      ...bucket,
      type: newType,
      field: null,
      label: BUCKET_TYPE_OPTIONS.find((o) => o.value === newType)?.label ?? newType,
      params: getDefaultParams(newType),
    };
    onUpdate(index, updated);
  };

  const handleFieldChange = (fieldName: string) => {
    onUpdate(index, { ...bucket, field: fieldName || null });
  };

  const handleLabelChange = (label: string) => {
    onUpdate(index, { ...bucket, label });
  };

  // ─── Terms-specific handlers ─────────────────────────────────────────────

  const handleSizeChange = (size: number) => {
    const params = bucket.params as TermsParams;
    onUpdate(index, { ...bucket, params: { ...params, size } });
  };

  const handleOrderChange = (orderStr: string) => {
    const [field, direction] = orderStr.split(":");
    const params = bucket.params as TermsParams;
    onUpdate(index, {
      ...bucket,
      params: { ...params, order: { field, direction: direction as "asc" | "desc" } },
    });
  };

  // ─── Date Histogram handlers ─────────────────────────────────────────────

  const handleDateIntervalChange = (interval: string) => {
    onUpdate(index, { ...bucket, params: { interval } as DateHistogramParams });
  };

  // ─── Histogram handlers ──────────────────────────────────────────────────

  const handleHistogramIntervalChange = (interval: number) => {
    onUpdate(index, { ...bucket, params: { interval } as HistogramParams });
  };

  // ─── Range handlers ──────────────────────────────────────────────────────

  const handleRangeChange = (rangeIndex: number, field: "from" | "to", value: number) => {
    const params = bucket.params as RangeParams;
    const ranges = [...params.ranges];
    ranges[rangeIndex] = { ...ranges[rangeIndex], [field]: value };
    onUpdate(index, { ...bucket, params: { ranges } as RangeParams });
  };

  const handleAddRange = () => {
    const params = bucket.params as RangeParams;
    const lastRange = params.ranges[params.ranges.length - 1];
    const newFrom = lastRange ? lastRange.to : 0;
    const ranges = [...params.ranges, { from: newFrom, to: newFrom + 100 }];
    onUpdate(index, { ...bucket, params: { ranges } as RangeParams });
  };

  const handleRemoveRange = (rangeIndex: number) => {
    const params = bucket.params as RangeParams;
    if (params.ranges.length <= 1) return;
    const ranges = params.ranges.filter((_, i) => i !== rangeIndex);
    onUpdate(index, { ...bucket, params: { ranges } as RangeParams });
  };

  // ─── Filters handlers ────────────────────────────────────────────────────

  const handleFilterLabelChange = (filterIndex: number, label: string) => {
    const params = bucket.params as FiltersParams;
    const filters = [...params.filters];
    filters[filterIndex] = { ...filters[filterIndex], label };
    onUpdate(index, { ...bucket, params: { filters } as FiltersParams });
  };

  const handleFilterConditionChange = (
    filterIndex: number,
    field: keyof ElasticFilter,
    value: string | number | boolean | null
  ) => {
    const params = bucket.params as FiltersParams;
    const filters = [...params.filters];
    filters[filterIndex] = {
      ...filters[filterIndex],
      filter: { ...filters[filterIndex].filter, [field]: value },
    };
    onUpdate(index, { ...bucket, params: { filters } as FiltersParams });
  };

  const handleAddFilter = () => {
    const params = bucket.params as FiltersParams;
    const filters = [
      ...params.filters,
      { label: `Filter ${params.filters.length + 1}`, filter: { field: "", operator: "is", value: "" } as ElasticFilter },
    ];
    onUpdate(index, { ...bucket, params: { filters } as FiltersParams });
  };

  const handleRemoveFilter = (filterIndex: number) => {
    const params = bucket.params as FiltersParams;
    if (params.filters.length <= 1) return;
    const filters = params.filters.filter((_, i) => i !== filterIndex);
    onUpdate(index, { ...bucket, params: { filters } as FiltersParams });
  };

  // ─── Sub-bucket update handler ───────────────────────────────────────────

  const handleSubBucketUpdate = (_subIndex: number, subBucket: BucketAggregation) => {
    onUpdate(index, { ...bucket, subBucket });
  };

  const handleSubBucketRemove = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { subBucket: _removed, ...rest } = bucket;
    onUpdate(index, rest as BucketAggregation);
  };

  return (
    <div className="rounded-md border border-surface-border bg-surface-secondary p-3 space-y-3">
      {/* Header row: type select + remove button */}
      <div className="flex items-center gap-2">
        <select
          value={bucket.type}
          onChange={(e) => handleTypeChange(e.target.value as BucketType)}
          className="flex-1 px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors appearance-none cursor-pointer"
        >
          {BUCKET_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-2 rounded-md transition-colors shrink-0 text-muted hover:text-red-400 hover:bg-red-500/10"
          title="Remove bucket"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Field selector (hidden for filters type) */}
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
              value={bucket.field}
              onChange={handleFieldChange}
              filterByType={fieldTypes.length > 0 ? fieldTypes : undefined}
              placeholder="Select field..."
              disabled={noIndexPattern}
            />
          )}
        </div>
      )}

      {/* Type-specific options */}
      {bucket.type === "terms" && (
        <TermsOptions
          params={bucket.params as TermsParams}
          onSizeChange={handleSizeChange}
          onOrderChange={handleOrderChange}
        />
      )}

      {bucket.type === "date_histogram" && (
        <DateHistogramOptions
          params={bucket.params as DateHistogramParams}
          onIntervalChange={handleDateIntervalChange}
        />
      )}

      {bucket.type === "histogram" && (
        <HistogramOptions
          params={bucket.params as HistogramParams}
          onIntervalChange={handleHistogramIntervalChange}
        />
      )}

      {bucket.type === "range" && (
        <RangeOptions
          params={bucket.params as RangeParams}
          onRangeChange={handleRangeChange}
          onAddRange={handleAddRange}
          onRemoveRange={handleRemoveRange}
        />
      )}

      {bucket.type === "filters" && (
        <FiltersOptions
          params={bucket.params as FiltersParams}
          onFilterLabelChange={handleFilterLabelChange}
          onFilterConditionChange={handleFilterConditionChange}
          onAddFilter={handleAddFilter}
          onRemoveFilter={handleRemoveFilter}
        />
      )}

      {/* Custom label */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase text-muted">
          Custom Label
        </label>
        <input
          type="text"
          value={bucket.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="Custom label (optional)"
          className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
        />
      </div>

      {/* Sub-bucket */}
      {bucket.subBucket ? (
        <div className="ml-3 border-l-2 border-brand/30 pl-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase text-muted">
              Sub-Bucket
            </span>
          </div>
          <BucketAggregationItem
            bucket={bucket.subBucket}
            index={0}
            fields={fields}
            onUpdate={handleSubBucketUpdate}
            onRemove={handleSubBucketRemove}
            onAddSubBucket={() => {}}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onAddSubBucket(index)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Sub-Bucket
        </button>
      )}
    </div>
  );
}

// ─── Terms Options ───────────────────────────────────────────────────────────

function TermsOptions({
  params,
  onSizeChange,
  onOrderChange,
}: {
  params: TermsParams;
  onSizeChange: (size: number) => void;
  onOrderChange: (order: string) => void;
}) {
  const orderValue = `${params.order.field}:${params.order.direction}`;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase text-muted">
          Size
        </label>
        <input
          type="number"
          min={1}
          value={params.size}
          onChange={(e) => onSizeChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase text-muted">
          Order
        </label>
        <select
          value={orderValue}
          onChange={(e) => onOrderChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors appearance-none cursor-pointer"
        >
          {TERMS_ORDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Date Histogram Options ──────────────────────────────────────────────────

function DateHistogramOptions({
  params,
  onIntervalChange,
}: {
  params: DateHistogramParams;
  onIntervalChange: (interval: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase text-muted">
        Interval
      </label>
      <select
        value={params.interval}
        onChange={(e) => onIntervalChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors appearance-none cursor-pointer"
      >
        {DATE_HISTOGRAM_INTERVALS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Histogram Options ───────────────────────────────────────────────────────

function HistogramOptions({
  params,
  onIntervalChange,
}: {
  params: HistogramParams;
  onIntervalChange: (interval: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase text-muted">
        Minimum Interval
      </label>
      <input
        type="number"
        min={1}
        value={params.interval}
        onChange={(e) => onIntervalChange(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-full px-3 py-2 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
      />
    </div>
  );
}

// ─── Range Options ───────────────────────────────────────────────────────────

function RangeOptions({
  params,
  onRangeChange,
  onAddRange,
  onRemoveRange,
}: {
  params: RangeParams;
  onRangeChange: (rangeIndex: number, field: "from" | "to", value: number) => void;
  onAddRange: () => void;
  onRemoveRange: (rangeIndex: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase text-muted">
          Ranges
        </label>
        <button
          type="button"
          onClick={onAddRange}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      {params.ranges.map((range, rangeIndex) => (
        <div key={rangeIndex} className="flex items-center gap-2">
          <input
            type="number"
            value={range.from}
            onChange={(e) => onRangeChange(rangeIndex, "from", parseFloat(e.target.value) || 0)}
            placeholder="From"
            className="flex-1 px-3 py-1.5 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
          />
          <span className="text-[11px] text-muted">to</span>
          <input
            type="number"
            value={range.to}
            onChange={(e) => onRangeChange(rangeIndex, "to", parseFloat(e.target.value) || 0)}
            placeholder="To"
            className="flex-1 px-3 py-1.5 rounded-md border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
          />
          <button
            type="button"
            onClick={() => onRemoveRange(rangeIndex)}
            disabled={params.ranges.length <= 1}
            className={cn(
              "p-1 rounded transition-colors shrink-0",
              params.ranges.length > 1
                ? "text-muted hover:text-red-400 hover:bg-red-500/10"
                : "text-muted/30 cursor-not-allowed"
            )}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Filters Options ─────────────────────────────────────────────────────────

function FiltersOptions({
  params,
  onFilterLabelChange,
  onFilterConditionChange,
  onAddFilter,
  onRemoveFilter,
}: {
  params: FiltersParams;
  onFilterLabelChange: (filterIndex: number, label: string) => void;
  onFilterConditionChange: (
    filterIndex: number,
    field: keyof ElasticFilter,
    value: string | number | boolean | null
  ) => void;
  onAddFilter: () => void;
  onRemoveFilter: (filterIndex: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase text-muted">
          Filters
        </label>
        <button
          type="button"
          onClick={onAddFilter}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      {params.filters.map((filterEntry, filterIndex) => (
        <div key={filterIndex} className="space-y-1.5 rounded-md border border-surface-border/50 bg-surface-tertiary p-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filterEntry.label}
              onChange={(e) => onFilterLabelChange(filterIndex, e.target.value)}
              placeholder="Label"
              className="flex-1 px-2 py-1 rounded border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
            />
            <button
              type="button"
              onClick={() => onRemoveFilter(filterIndex)}
              disabled={params.filters.length <= 1}
              className={cn(
                "p-1 rounded transition-colors shrink-0",
                params.filters.length > 1
                  ? "text-muted hover:text-red-400 hover:bg-red-500/10"
                  : "text-muted/30 cursor-not-allowed"
              )}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="text"
              value={filterEntry.filter.field}
              onChange={(e) => onFilterConditionChange(filterIndex, "field", e.target.value)}
              placeholder="Field"
              className="px-2 py-1 rounded border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
            />
            <input
              type="text"
              value={filterEntry.filter.operator}
              onChange={(e) => onFilterConditionChange(filterIndex, "operator", e.target.value)}
              placeholder="Operator"
              className="px-2 py-1 rounded border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
            />
            <input
              type="text"
              value={filterEntry.filter.value?.toString() ?? ""}
              onChange={(e) => onFilterConditionChange(filterIndex, "value", e.target.value)}
              placeholder="Value"
              className="px-2 py-1 rounded border border-surface-border bg-surface-secondary text-primary text-small outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
