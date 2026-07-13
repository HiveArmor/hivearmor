"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logAnalyzerService } from "@/services/log-analyzer.service";
import type { ElasticFilter } from "@/services/elastic.service";

interface TopValue {
  value: string;
  count: number;
  percent: number;
}

interface Props {
  field: string;
  indexPattern: string;
  filters: ElasticFilter[];
  anchorRef: React.RefObject<HTMLElement | null>;
  onFilter: (field: string, value: string, exclude?: boolean) => void;
  onClose: () => void;
}

export function LogFieldStatsPopover({ field, indexPattern, filters, anchorRef, onFilter, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [topValues, setTopValues] = useState<TopValue[]>([]);
  const [total, setTotal] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const backendFilters = filters.map((f) => ({
      field: f.field,
      operator: f.operator,
      value: f.value,
    }));
    logAnalyzerService
      .getTopValues(field, indexPattern, backendFilters, 10)
      .then((res) => {
        setTopValues(res.top);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [field, indexPattern, filters]);

  // Position below the anchor element
  useEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const rect = anchor.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left}px`;
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const maxCount = Math.max(...topValues.map((v) => v.count), 1);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-64 bg-surface-elevated border border-surface-border rounded-lg shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border bg-surface-secondary/50">
        <div className="min-w-0">
          <p className="text-tiny font-medium text-primary truncate font-mono">{field}</p>
          {!loading && (
            <p className="text-tiny text-muted">{total.toLocaleString()} total values</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-border transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-2 space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-tiny">Loading top values…</span>
          </div>
        )}

        {!loading && topValues.length === 0 && (
          <div className="py-6 text-center text-tiny text-muted">
            No values found for this field.
          </div>
        )}

        {!loading && topValues.map((tv) => (
          <div key={tv.value} className="group/tv">
            <div className="flex items-center gap-1.5 mb-0.5">
              <button
                onClick={() => { onFilter(field, tv.value, false); onClose(); }}
                className="flex-1 min-w-0 text-left text-tiny text-primary truncate hover:text-brand transition-colors font-mono"
                title={tv.value}
              >
                {tv.value || <span className="text-muted italic">(empty)</span>}
              </button>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/tv:opacity-100 transition-opacity">
                <button
                  onClick={() => { onFilter(field, tv.value, false); onClose(); }}
                  className="text-tiny text-muted hover:text-success px-1 leading-none rounded hover:bg-success/10"
                  title="Filter for this value"
                >+</button>
                <button
                  onClick={() => { onFilter(field, tv.value, true); onClose(); }}
                  className="text-tiny text-muted hover:text-critical px-1 leading-none rounded hover:bg-critical/10"
                  title="Filter out this value"
                >−</button>
                <span className="text-tiny text-muted w-10 text-right">{tv.count.toLocaleString()}</span>
              </div>
              {/* Percent label always visible */}
              <span className={cn("text-tiny text-muted shrink-0 w-10 text-right", "group-hover/tv:hidden")}>
                {tv.percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-1 bg-surface-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand/60 rounded-full transition-all"
                style={{ width: `${(tv.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
