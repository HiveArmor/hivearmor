"use client";

import { Play, Code } from "lucide-react";
import { useVisualizationStore } from "@/store/visualization";

// ─── Component ───────────────────────────────────────────────────────────────

export function SqlEditorPanel() {
  const sqlQuery = useVisualizationStore((s) => s.sqlQuery);
  const setSqlQuery = useVisualizationStore((s) => s.setSqlQuery);
  const indexPattern = useVisualizationStore((s) => s.indexPattern);
  const previewLoading = useVisualizationStore((s) => s.previewLoading);

  const handleRun = () => {
    // Trigger a preview by slightly updating the query (append/remove a space)
    // This forces the debounced effect to re-fire
    setSqlQuery(sqlQuery.trim());
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-muted" />
          <h3 className="text-small font-semibold text-primary">SQL Query</h3>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={!sqlQuery.trim() || !indexPattern || previewLoading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-3 h-3" />
          Run
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 p-4 overflow-hidden">
        <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          placeholder={`SELECT * FROM ${indexPattern?.pattern || '"index-pattern"'}\nWHERE @timestamp > NOW() - INTERVAL 24 HOUR\nLIMIT 100`}
          spellCheck={false}
          className="w-full h-full resize-none rounded-md border border-surface-border bg-surface-secondary p-3 text-small text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand/50 transition-colors"
        />
      </div>

      {/* Hints */}
      <div className="px-4 py-2 border-t border-surface-border shrink-0">
        <p className="text-[11px] text-muted">
          Write a SQL query against the selected index pattern. Click Run or changes will auto-execute after 500ms.
        </p>
      </div>
    </div>
  );
}
