"use client";

import { useState } from "react";
import { ChevronDown, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimeRange {
  type: "relative" | "absolute";
  relative?: string;
  from?: string;
  to?: string;
  label: string;
}

const QUICK_RANGES: { label: string; value: string }[] = [
  { label: "15 min", value: "15m" },
  { label: "30 min", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "6 hours", value: "6h" },
  { label: "24 hours", value: "24h" },
  { label: "3 days", value: "3d" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

interface LogTimePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}

export function LogTimePicker({ value, onChange, className }: LogTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"quick" | "absolute">("quick");
  const [fromInput, setFromInput] = useState(value.from ?? "");
  const [toInput, setToInput] = useState(value.to ?? "");

  const selectQuick = (rv: string, label: string) => {
    onChange({ type: "relative", relative: rv, label });
    setOpen(false);
  };

  const applyAbsolute = () => {
    if (!fromInput || !toInput) return;
    onChange({
      type: "absolute",
      from: fromInput,
      to: toInput,
      label: `${fromInput.slice(0, 16)} → ${toInput.slice(0, 16)}`,
    });
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md border text-tiny h-7 transition-all",
          "bg-surface-secondary border-surface-border text-secondary hover:text-primary hover:border-brand/40",
          open && "border-brand/60 text-primary bg-brand-subtle/20"
        )}
      >
        <Clock className="w-3 h-3 text-brand shrink-0" />
        <span className="max-w-[100px] truncate">{value.label}</span>
        <ChevronDown className={cn("w-2.5 h-2.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-72 card shadow-drawer animate-scale-in">
            {/* Tabs */}
            <div className="flex border-b border-surface-border">
              {(["quick", "absolute"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 px-3 py-2 text-small capitalize transition-colors",
                    tab === t
                      ? "text-primary border-b-2 border-brand -mb-px"
                      : "text-muted hover:text-secondary"
                  )}
                >
                  {t === "quick" ? "Quick ranges" : "Absolute"}
                </button>
              ))}
            </div>

            {tab === "quick" && (
              <div className="p-2 grid grid-cols-2 gap-1">
                {QUICK_RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => selectQuick(r.value, r.label)}
                    className={cn(
                      "px-3 py-1.5 rounded text-small text-left transition-colors",
                      value.relative === r.value
                        ? "bg-brand-subtle text-brand font-medium"
                        : "text-secondary hover:bg-surface-tertiary"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {tab === "absolute" && (
              <div className="p-3 space-y-3">
                <div className="space-y-1">
                  <label className="text-tiny text-muted">From</label>
                  <input
                    type="datetime-local"
                    value={fromInput}
                    onChange={(e) => setFromInput(e.target.value)}
                    className="input-base w-full text-small"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-tiny text-muted">To</label>
                  <input
                    type="datetime-local"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    className="input-base w-full text-small"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={applyAbsolute} className="btn btn-sm btn-primary flex-1">
                    Apply range
                  </button>
                  <button
                    onClick={() => { setFromInput(""); setToInput(""); }}
                    className="btn btn-sm btn-ghost"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Recently used — bottom shortcut row */}
            <div className="px-3 py-2 border-t border-surface-border flex items-center gap-1 flex-wrap">
              <span className="text-tiny text-muted mr-1">Recent:</span>
              {["1h", "24h", "7d"].map((r) => (
                <button
                  key={r}
                  onClick={() => selectQuick(r, QUICK_RANGES.find((x) => x.value === r)?.label ?? r)}
                  className="px-1.5 py-0.5 rounded text-tiny text-muted bg-surface-tertiary hover:text-primary transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const DEFAULT_TIME_RANGE: TimeRange = {
  type: "relative",
  relative: "24h",
  label: "24 hours",
};
