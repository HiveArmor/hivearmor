"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useVisualizationStore } from "@/store/visualization";

// ─── Quick Range Options ─────────────────────────────────────────────────────

const QUICK_RANGES: { label: string; from: string }[] = [
  { label: "15m", from: "now-15m" },
  { label: "1h", from: "now-1h" },
  { label: "6h", from: "now-6h" },
  { label: "24h", from: "now-24h" },
  { label: "7d", from: "now-7d" },
  { label: "30d", from: "now-30d" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function TimeRangeFilter() {
  const timeRange = useVisualizationStore((s) => s.timeRange);
  const setTimeRange = useVisualizationStore((s) => s.setTimeRange);

  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(timeRange.from);
  const [customTo, setCustomTo] = useState(timeRange.to);

  const handleQuickRange = (from: string) => {
    setTimeRange({ from, to: "now" });
    setCustomFrom(from);
    setCustomTo("now");
  };

  const handleApplyCustom = () => {
    if (customFrom.trim() && customTo.trim()) {
      setTimeRange({ from: customFrom.trim(), to: customTo.trim() });
    }
  };

  // Determine active quick range
  const activeQuick = QUICK_RANGES.find(
    (r) => r.from === timeRange.from && timeRange.to === "now"
  );

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted" />
        <span className="text-[11px] font-semibold uppercase text-muted">
          Time Range
        </span>
      </div>

      {/* Quick range buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        {QUICK_RANGES.map((range) => (
          <button
            key={range.from}
            type="button"
            onClick={() => handleQuickRange(range.from)}
            className={cn(
              "px-2 py-1.5 rounded-md text-small font-medium transition-colors text-center",
              activeQuick?.from === range.from
                ? "bg-brand/15 text-brand border border-brand/30"
                : "bg-surface-tertiary text-muted hover:text-primary hover:bg-surface-tertiary/80 border border-transparent"
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Custom range toggle */}
      <button
        type="button"
        onClick={() => setShowCustom(!showCustom)}
        className="flex items-center gap-1.5 text-small text-muted hover:text-primary transition-colors w-full"
      >
        {showCustom ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        <span>Custom range</span>
      </button>

      {/* Custom range inputs */}
      {showCustom && (
        <div className="space-y-2 pl-1">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase text-muted">
              From
            </label>
            <input
              type="text"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              placeholder="now-24h"
              className="w-full px-3 py-1.5 rounded-md border border-surface-border bg-surface-secondary text-primary text-small placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase text-muted">
              To
            </label>
            <input
              type="text"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              placeholder="now"
              className="w-full px-3 py-1.5 rounded-md border border-surface-border bg-surface-secondary text-primary text-small placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyCustom}
            className="w-full px-3 py-1.5 rounded-md bg-brand/15 text-brand text-small font-medium hover:bg-brand/25 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Current range display */}
      <div className="px-2 py-1.5 rounded bg-surface-tertiary text-[11px] text-muted">
        {timeRange.from} → {timeRange.to}
      </div>
    </div>
  );
}
