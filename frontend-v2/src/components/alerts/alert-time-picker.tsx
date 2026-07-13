"use client";

import { useState } from "react";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimeRange {
  from: string;
  to: string;
}

interface Preset {
  label: string;
  key: string;
  resolve: () => TimeRange;
}

const PRESETS: Preset[] = [
  {
    label: "1h",
    key: "1h",
    resolve: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    },
  },
  {
    label: "6h",
    key: "6h",
    resolve: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    },
  },
  {
    label: "24h",
    key: "24h",
    resolve: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    },
  },
  {
    label: "7d",
    key: "7d",
    resolve: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    },
  },
  {
    label: "30d",
    key: "30d",
    resolve: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    },
  },
  {
    label: "All",
    key: "all",
    resolve: () => ({ from: "", to: "" }),
  },
];

interface AlertTimePickerProps {
  value: string;
  onChange: (range: TimeRange | null, key: string) => void;
  className?: string;
}

export function AlertTimePicker({ value, onChange, className }: AlertTimePickerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const handlePreset = (preset: Preset) => {
    setCustomOpen(false);
    if (preset.key === "all") {
      onChange(null, "all");
    } else {
      onChange(preset.resolve(), preset.key);
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      onChange(
        { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() },
        "custom"
      );
      setCustomOpen(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-0.5">
        <Calendar className="w-3.5 h-3.5 text-muted mr-1 shrink-0" />
        <div className="flex items-center gap-0.5 bg-surface-secondary rounded-md p-0.5 border border-surface-border">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePreset(preset)}
              className={cn(
                "px-2.5 py-1 rounded text-tiny font-medium transition-colors whitespace-nowrap",
                value === preset.key
                  ? "bg-brand-subtle text-brand"
                  : "text-muted hover:text-secondary hover:bg-surface-tertiary"
              )}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setCustomOpen((o) => !o)}
            className={cn(
              "px-2.5 py-1 rounded text-tiny font-medium transition-colors flex items-center gap-1",
              value === "custom"
                ? "bg-brand-subtle text-brand"
                : "text-muted hover:text-secondary hover:bg-surface-tertiary"
            )}
          >
            Custom
            {customOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {customOpen && (
        <div className="flex items-center gap-2 animate-fade-in">
          <input
            type="datetime-local"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="input-base text-tiny py-1 px-2"
          />
          <span className="text-tiny text-muted">→</span>
          <input
            type="datetime-local"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="input-base text-tiny py-1 px-2"
          />
          <button
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            className="btn btn-sm btn-primary disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
