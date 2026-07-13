"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  PieChart,
  Cloud,
  Table,
  List,
  Gauge,
  Target,
  Hash,
  Map,
  Grid3x3,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CHART_TYPE_CONFIG } from "@/types/visualization-builder";
import type { LucideIcon } from "lucide-react";

// Map icon string names from CHART_TYPE_CONFIG to actual Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  TrendingUp,
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  PieChart,
  Cloud,
  Table,
  List,
  Gauge,
  Target,
  Hash,
  Map,
  Grid3x3,
  Type,
};

export default function NewVisualizationPage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [name, setName] = useState("");

  const selectedConfig = CHART_TYPE_CONFIG.find((c) => c.id === selectedType);
  const IconComponent = selectedConfig ? ICON_MAP[selectedConfig.icon] : null;

  const canCreate = !!selectedType && name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    const encodedName = encodeURIComponent(name.trim());
    router.push(
      `/creator/visualizations/builder?chart=${selectedType}&name=${encodedName}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-h1">New Visualization</h1>
        <p className="text-secondary text-small mt-1">
          Select a chart type and provide a name to begin building your visualization.
        </p>
      </div>

      {/* Name input */}
      <div className="max-w-md">
        <label className="text-small text-secondary block mb-1.5">
          Visualization Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-base w-full"
          placeholder="My Visualization"
          autoFocus
        />
      </div>

      {/* Two-column layout: chart grid (left) + description panel (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Chart type grid */}
        <div>
          <label className="text-small text-secondary block mb-3">
            Select Chart Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CHART_TYPE_CONFIG.map((chart) => {
              const Icon = ICON_MAP[chart.icon];
              const isSelected = selectedType === chart.id;
              return (
                <button
                  key={chart.id}
                  onClick={() => setSelectedType(chart.id)}
                  className={cn(
                    "card p-4 flex flex-col items-center text-center gap-2 transition-all cursor-pointer",
                    isSelected
                      ? "border-brand ring-2 ring-brand/30"
                      : "hover:border-surface-border-strong"
                  )}
                >
                  <div
                    className={cn(
                      "transition-colors",
                      isSelected ? "text-brand" : "text-muted"
                    )}
                  >
                    {Icon && <Icon className="w-7 h-7" />}
                  </div>
                  <p className="text-small text-primary font-medium">
                    {chart.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Description panel */}
        <div className="card p-6 flex flex-col items-center justify-center text-center min-h-[300px]">
          {selectedConfig && IconComponent ? (
            <>
              <div className="text-brand mb-4">
                <IconComponent className="w-12 h-12" />
              </div>
              <h3 className="text-h3 text-primary mb-2">
                {selectedConfig.name}
              </h3>
              <p className="text-body text-secondary">
                {selectedConfig.description}
              </p>
            </>
          ) : (
            <>
              <div className="text-muted mb-4 opacity-40">
                <BarChart3 className="w-12 h-12" />
              </div>
              <h3 className="text-h3 text-primary mb-2">No chart selected</h3>
              <p className="text-body text-muted">
                Select a chart type from the grid to see its description.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/creator/visualizations")}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Visualization
        </button>
      </div>
    </div>
  );
}
