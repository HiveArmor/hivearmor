"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisualizationStore } from "@/store/visualization";
import { visualizationService } from "@/services/visualization.service";
import { toast } from "@/components/ui/toast";
import { IndexPatternSelector } from "@/components/builder/index-pattern-selector";

// ─── Component ───────────────────────────────────────────────────────────────

export function BuilderHeader() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const name = useVisualizationStore((s) => s.name);
  const setName = useVisualizationStore((s) => s.setName);
  const queryMode = useVisualizationStore((s) => s.queryMode);
  const setQueryMode = useVisualizationStore((s) => s.setQueryMode);
  const setSqlQuery = useVisualizationStore((s) => s.setSqlQuery);
  const isValid = useVisualizationStore((s) => s.isValid);
  const id = useVisualizationStore((s) => s.id);
  const indexPattern = useVisualizationStore((s) => s.indexPattern);
  const metrics = useVisualizationStore((s) => s.metrics);
  const toApiPayload = useVisualizationStore((s) => s.toApiPayload);

  const handleBack = () => {
    router.push("/creator/visualizations");
  };

  const handleModeToggle = (mode: "dsl" | "sql") => {
    if (mode === queryMode) return;
    setQueryMode(mode);
    // Clear SQL query when switching back to DSL
    if (mode === "dsl") {
      setSqlQuery("");
    }
  };

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      toast("error", "Validation Error", "Visualization name is required");
      return;
    }
    if (!indexPattern) {
      toast("error", "Validation Error", "Please select an index pattern");
      return;
    }
    if (metrics.length === 0) {
      toast("error", "Validation Error", "At least one metric aggregation is required");
      return;
    }

    setSaving(true);
    try {
      const payload = toApiPayload();
      let result;

      if (id) {
        result = await visualizationService.update(payload);
      } else {
        result = await visualizationService.create(payload);
      }

      if (result) {
        toast("success", id ? "Visualization updated" : "Visualization created");
        router.push("/creator/visualizations");
      } else {
        toast("error", "Save Failed", "Could not save visualization. Please try again.");
      }
    } catch {
      toast("error", "Save Failed", "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-primary shrink-0">
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="p-1.5 rounded-md hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
        title="Back to visualizations"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Visualization name"
        className="input-base w-48 lg:w-64 text-small"
      />

      {/* Index pattern selector */}
      <IndexPatternSelector />

      {/* Query mode toggle */}
      <div className="flex items-center rounded-md border border-surface-border overflow-hidden ml-auto">
        <button
          type="button"
          onClick={() => handleModeToggle("dsl")}
          className={cn(
            "px-3 py-1.5 text-[11px] font-medium transition-colors",
            queryMode === "dsl"
              ? "bg-brand text-white"
              : "bg-surface-secondary text-muted hover:text-primary"
          )}
        >
          DSL
        </button>
        <button
          type="button"
          onClick={() => handleModeToggle("sql")}
          className={cn(
            "px-3 py-1.5 text-[11px] font-medium transition-colors",
            queryMode === "sql"
              ? "bg-brand text-white"
              : "bg-surface-secondary text-muted hover:text-primary"
          )}
        >
          SQL
        </button>
      </div>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !isValid}
        className="btn-primary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
