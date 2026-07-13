"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Database, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { visualizationService } from "@/services/visualization.service";
import { useVisualizationStore } from "@/store/visualization";
import type { IndexPattern } from "@/types/visualization-builder";

// ─── Component ───────────────────────────────────────────────────────────────

export function IndexPatternSelector() {
  const indexPattern = useVisualizationStore((s) => s.indexPattern);
  const setIndexPattern = useVisualizationStore((s) => s.setIndexPattern);
  const setFields = useVisualizationStore((s) => s.setFields);

  const [patterns, setPatterns] = useState<IndexPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch patterns on mount
  useEffect(() => {
    fetchPatterns();
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchPatterns = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await visualizationService.getIndexPatterns();
      setPatterns(result);
    } catch {
      setError("Failed to load index patterns");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (pattern: IndexPattern) => {
    setIndexPattern({ id: pattern.id, pattern: pattern.pattern });
    setOpen(false);

    // Fetch fields for the selected pattern
    const fields = await visualizationService.getFieldsForPattern(pattern.id);
    setFields(fields);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-small border transition-colors min-w-[180px]",
          "border-surface-border bg-surface-secondary hover:bg-surface-tertiary",
          open && "border-brand/50"
        )}
      >
        <Database className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className={cn("truncate", indexPattern ? "text-primary" : "text-muted")}>
          {indexPattern ? indexPattern.pattern : "Select index pattern"}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted ml-auto shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto rounded-md border border-surface-border bg-surface-primary shadow-elevated z-50">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
              <span className="text-small text-muted">Loading patterns...</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 py-6 px-4">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-small text-muted">{error}</span>
              <button
                type="button"
                onClick={fetchPatterns}
                className="text-[11px] text-brand hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && patterns.length === 0 && (
            <div className="py-6 text-center text-small text-muted">
              No index patterns available
            </div>
          )}

          {!loading && !error && patterns.length > 0 && (
            <div className="py-1">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => handleSelect(pattern)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-small transition-colors hover:bg-surface-tertiary",
                    indexPattern?.id === pattern.id
                      ? "text-brand bg-brand/5"
                      : "text-primary"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Database className="w-3 h-3 text-muted shrink-0" />
                    {pattern.pattern}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
