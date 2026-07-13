"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVisualizationStore } from "@/store/visualization";
import { visualizationService } from "@/services/visualization.service";
import { toast } from "@/components/ui/toast";
import { BuilderWorkspace } from "@/components/builder/builder-workspace";
import { ChartType } from "@/types/visualization-builder";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);

  const setChartType = useVisualizationStore((s) => s.setChartType);
  const setName = useVisualizationStore((s) => s.setName);
  const loadVisualization = useVisualizationStore((s) => s.loadVisualization);
  const reset = useVisualizationStore((s) => s.reset);

  // Initialize store from query params on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const chart = searchParams.get("chart") as ChartType | null;
    const name = searchParams.get("name");
    const mode = searchParams.get("mode");
    const visualizationId = searchParams.get("visualizationId");

    // Set chart type and name from params
    if (chart) {
      setChartType(chart);
    }
    if (name) {
      setName(name);
    }

    // Edit mode: fetch existing visualization
    if (mode === "edit" && visualizationId) {
      const id = parseInt(visualizationId, 10);
      if (!isNaN(id)) {
        const fetchVis = async () => {
          try {
            const vis = await visualizationService.getById(id);
            if (vis) {
              loadVisualization(vis);
            } else {
              toast("error", "Not Found", "Could not load visualization for editing");
            }
          } catch {
            toast("error", "Load Failed", "Failed to fetch visualization data");
          }
        };
        fetchVis();
      }
    }
  }, [searchParams, setChartType, setName, loadVisualization]);

  // Reset store on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <BuilderWorkspace />
    </div>
  );
}
