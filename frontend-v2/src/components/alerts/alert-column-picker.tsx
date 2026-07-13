"use client";

import { useState, useRef, useEffect } from "react";
import { Columns, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColumnDef {
  key: string;
  label: string;
  default: boolean;
  width: number;
  group?: "core" | "endpoint" | "network" | "extra";
}

export const ALERT_COLUMNS: ColumnDef[] = [
  { key: "severity",       label: "Severity",       default: true,  width: 90,  group: "core"     },
  { key: "name",           label: "Alert",          default: true,  width: 260, group: "core"     },
  { key: "status",         label: "Status",         default: true,  width: 110, group: "core"     },
  { key: "timestamp",      label: "Time",           default: true,  width: 130, group: "core"     },
  { key: "dataSource",     label: "Sensor",         default: true,  width: 130, group: "core"     },
  { key: "technique",      label: "Technique",      default: true,  width: 140, group: "core"     },
  { key: "category",       label: "Category",       default: false, width: 160, group: "core"     },
  { key: "target.ip",      label: "Target IP",      default: true,  width: 130, group: "endpoint" },
  { key: "target.host",    label: "Target Host",    default: false, width: 130, group: "endpoint" },
  { key: "target.user",    label: "Target User",    default: false, width: 120, group: "endpoint" },
  { key: "adversary.ip",   label: "Adversary IP",   default: true,  width: 130, group: "network"  },
  { key: "adversary.host", label: "Adversary Host", default: false, width: 130, group: "network"  },
  { key: "echoes",         label: "Echoes",         default: true,  width: 80,  group: "extra"    },
  { key: "tags",           label: "Tags",           default: false, width: 140, group: "extra"    },
  { key: "impactScore",    label: "Impact",         default: false, width: 80,  group: "extra"    },
];

const GROUPS: { key: ColumnDef["group"]; label: string }[] = [
  { key: "core",     label: "Core"     },
  { key: "endpoint", label: "Endpoint" },
  { key: "network",  label: "Network"  },
  { key: "extra",    label: "Extra"    },
];

const STORAGE_KEY = "alert_columns_v1";

export function loadColPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch { /* ignore */ }
  return Object.fromEntries(ALERT_COLUMNS.map((c) => [c.key, c.default]));
}

export function saveColPrefs(prefs: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

interface AlertColumnPickerProps {
  visible: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
}

export function AlertColumnPicker({ visible, onChange }: AlertColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (key: string) => {
    const next = { ...visible, [key]: !visible[key] };
    onChange(next);
    saveColPrefs(next);
  };

  const resetDefaults = () => {
    const defaults = Object.fromEntries(ALERT_COLUMNS.map((c) => [c.key, c.default]));
    onChange(defaults);
    saveColPrefs(defaults);
  };

  const visibleCount = Object.values(visible).filter(Boolean).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Choose columns"
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-tiny transition-colors",
          open
            ? "bg-brand-subtle text-brand"
            : "text-muted hover:text-secondary hover:bg-surface-tertiary"
        )}
      >
        <Columns className="w-3.5 h-3.5" />
        <span>{visibleCount}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 card shadow-dropdown py-2 animate-scale-in">
          {GROUPS.map((g) => {
            const cols = ALERT_COLUMNS.filter((c) => c.group === g.key);
            return (
              <div key={g.key}>
                <p className="px-3 pt-1.5 pb-0.5 text-tiny font-semibold text-muted uppercase tracking-wider">
                  {g.label}
                </p>
                {cols.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2.5 px-3 py-1 cursor-pointer hover:bg-surface-tertiary rounded mx-1"
                  >
                    <input
                      type="checkbox"
                      checked={visible[col.key] ?? col.default}
                      onChange={() => toggle(col.key)}
                      className="rounded border-surface-border accent-brand w-3.5 h-3.5"
                    />
                    <span className="text-small text-secondary">{col.label}</span>
                  </label>
                ))}
              </div>
            );
          })}
          <div className="border-t border-surface-border/50 mt-2 pt-1.5 px-3">
            <button
              onClick={resetDefaults}
              className="flex items-center gap-1.5 text-tiny text-muted hover:text-secondary transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
