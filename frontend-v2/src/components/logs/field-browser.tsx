"use client";

import { useState, useMemo } from "react";
import {
  Search, Plus, Minus, Type, Calendar, Globe, Hash,
  ToggleLeft, ChevronRight, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FieldType = "keyword" | "text" | "date" | "ip" | "number" | "boolean" | "object";

export interface FieldDef {
  name: string;
  type: FieldType;
  hitPct?: number;         // 0–100, how many docs have this field
  topValues?: { value: string; count: number }[];
}

interface FieldBrowserProps {
  fields: FieldDef[];
  selectedFields: string[];
  onAdd: (field: string) => void;
  onRemove: (field: string) => void;
  onFilter: (field: string, value: string, exclude?: boolean) => void;
  onShowStats?: (field: string, anchorEl: HTMLElement) => void;
  className?: string;
}

const TYPE_ICONS: Record<FieldType, React.ReactNode> = {
  keyword: <span className="text-[10px] font-bold text-brand leading-none">K</span>,
  text:    <Type      className="w-2.5 h-2.5 text-muted" />,
  date:    <Calendar  className="w-2.5 h-2.5 text-brand-accent" />,
  ip:      <Globe     className="w-2.5 h-2.5 text-yellow-400" />,
  number:  <Hash      className="w-2.5 h-2.5 text-green-400" />,
  boolean: <ToggleLeft className="w-2.5 h-2.5 text-purple-400" />,
  object:  <ChevronRight className="w-2.5 h-2.5 text-muted" />,
};

function FieldRow({
  field,
  selected,
  onAdd,
  onRemove,
  onFilter,
  onShowStats,
}: {
  field: FieldDef;
  selected: boolean;
  onAdd: (f: string) => void;
  onRemove: (f: string) => void;
  onFilter: (field: string, value: string, exclude?: boolean) => void;
  onShowStats?: (field: string, anchorEl: HTMLElement) => void;
}) {
  const [showStats, setShowStats] = useState(false);
  const maxCount = field.topValues
    ? Math.max(...field.topValues.map((v) => v.count), 1)
    : 1;

  return (
    <div className="group relative">
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors cursor-default",
        "hover:bg-surface-tertiary",
        selected && "bg-brand-subtle/40"
      )}>
        {/* Type icon */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {TYPE_ICONS[field.type]}
        </span>

        {/* Field name */}
        <span
          className={cn(
            "flex-1 text-small truncate cursor-pointer",
            selected ? "text-brand" : "text-secondary"
          )}
          onClick={() => setShowStats(!showStats)}
          title={field.name}
        >
          {field.name}
        </span>

        {/* Hit % */}
        {field.hitPct !== undefined && (
          <span className="text-tiny text-muted shrink-0">{field.hitPct}%</span>
        )}

        {/* Action buttons (visible on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => {
              const aggregatable = field.type !== "object";
              if (onShowStats && aggregatable) onShowStats(field.name, e.currentTarget);
              else setShowStats(!showStats);
            }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-border text-muted hover:text-primary"
            title="Show top values"
          >
            <BarChart2 className="w-3 h-3" />
          </button>
          {selected ? (
            <button
              onClick={() => onRemove(field.name)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-border text-muted hover:text-critical"
              title="Remove column"
            >
              <Minus className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={() => onAdd(field.name)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-border text-muted hover:text-success"
              title="Add as column"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Top values inline expand */}
      {showStats && field.topValues && (
        <div className="mx-2 mb-1 p-2 rounded bg-surface-elevated border border-surface-border/50 space-y-1.5">
          {field.topValues.map((tv) => (
            <div key={tv.value} className="group/tv space-y-0.5">
              <div className="flex items-center justify-between gap-1">
                <button
                  onClick={() => onFilter(field.name, tv.value, false)}
                  className="text-tiny text-primary truncate max-w-[120px] text-left hover:text-brand transition-colors"
                  title={`Filter: ${field.name} = ${tv.value}`}
                >
                  {tv.value}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover/tv:opacity-100 transition-opacity">
                  <button
                    onClick={() => onFilter(field.name, tv.value, false)}
                    className="text-tiny text-muted hover:text-success px-1 leading-none"
                    title="Include"
                  >+</button>
                  <button
                    onClick={() => onFilter(field.name, tv.value, true)}
                    className="text-tiny text-muted hover:text-critical px-1 leading-none"
                    title="Exclude"
                  >−</button>
                  <span className="text-tiny text-muted">{tv.count}</span>
                </div>
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
      )}
    </div>
  );
}

export function FieldBrowser({
  fields,
  selectedFields,
  onAdd,
  onRemove,
  onFilter,
  onShowStats,
  className,
}: FieldBrowserProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FieldType | "all">("all");

  const filtered = useMemo(() => {
    let list = fields;
    if (filterType !== "all") list = list.filter((f) => f.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    return list;
  }, [fields, search, filterType]);

  const selected = filtered.filter((f) => selectedFields.includes(f.name));
  const available = filtered.filter((f) => !selectedFields.includes(f.name));

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-surface-primary border-r border-surface-border", className)}>
      {/* Header */}
      <div className="px-3 py-3 border-b border-surface-border shrink-0">
        <h3 className="text-small font-semibold text-primary mb-2">Field Browser</h3>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base w-full pl-7 text-small py-1.5"
          />
        </div>
        {/* Type filter chips */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {(["all", "keyword", "date", "ip", "number"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                "px-2 py-0.5 rounded text-tiny transition-colors",
                filterType === t
                  ? "bg-brand-subtle text-brand"
                  : "text-muted hover:text-secondary hover:bg-surface-tertiary"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable field list */}
      <div className="flex-1 overflow-y-auto">
        {/* Selected fields */}
        {selected.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-tiny text-muted font-medium uppercase tracking-wider bg-surface-secondary/50 sticky top-0 z-10">
              Selected ({selected.length})
            </div>
            <div className="px-1 py-1 space-y-0.5">
              {selected.map((f) => (
                <FieldRow
                  key={f.name}
                  field={f}
                  selected
                  onAdd={onAdd}
                  onRemove={onRemove}
                  onFilter={onFilter}
                  onShowStats={onShowStats}
                />
              ))}
            </div>
          </div>
        )}

        {/* Available fields */}
        {available.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-tiny text-muted font-medium uppercase tracking-wider bg-surface-secondary/50 sticky top-0 z-10">
              Available ({available.length})
            </div>
            <div className="px-1 py-1 space-y-0.5">
              {available.map((f) => (
                <FieldRow
                  key={f.name}
                  field={f}
                  selected={false}
                  onAdd={onAdd}
                  onRemove={onRemove}
                  onFilter={onFilter}
                  onShowStats={onShowStats}
                />
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-small text-muted">
            No fields match &ldquo;{search}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
