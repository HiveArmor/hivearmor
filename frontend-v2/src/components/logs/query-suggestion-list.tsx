"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Suggestion, SuggestionKind } from "@/hooks/use-query-autocomplete";
import { Hash, Type, Calendar, Globe, ToggleLeft, Zap, AlertCircle, Code2 } from "lucide-react";

// ── Kind badge / icon ─────────────────────────────────────────────────────────

const KIND_COLOR: Record<SuggestionKind, string> = {
  field:      "text-brand",
  value:      "text-success",
  operator:   "text-brand-accent",
  keyword:    "text-brand-accent",
  correction: "text-warning",
};

function FieldTypeIcon({ type }: { type?: string }) {
  switch (type) {
    case "date":    return <Calendar   className="w-3 h-3 text-brand-accent shrink-0" />;
    case "ip":      return <Globe      className="w-3 h-3 text-yellow-400 shrink-0" />;
    case "long":
    case "integer":
    case "float":
    case "double":
    case "number":  return <Hash       className="w-3 h-3 text-green-400 shrink-0" />;
    case "boolean": return <ToggleLeft className="w-3 h-3 text-purple-400 shrink-0" />;
    case "keyword": return <span className="text-[10px] font-bold text-brand leading-none shrink-0">K</span>;
    default:        return <Type       className="w-3 h-3 text-muted shrink-0" />;
  }
}

function KindIcon({ kind, detail }: { kind: SuggestionKind; detail?: string }) {
  if (kind === "operator" || kind === "keyword") return <Zap className="w-3 h-3 text-brand-accent shrink-0" />;
  if (kind === "correction") return <AlertCircle className="w-3 h-3 text-warning shrink-0" />;
  if (kind === "value") return <Code2 className="w-3 h-3 text-success shrink-0" />;
  return <FieldTypeIcon type={detail} />;
}

// ── List component ────────────────────────────────────────────────────────────

interface QuerySuggestionListProps {
  suggestions: Suggestion[];
  activeIndex: number;
  onAccept: (s: Suggestion) => void;
  onSetActive?: (i: number) => void;
  className?: string;
}

export function QuerySuggestionList({
  suggestions,
  activeIndex,
  onAccept,
  onSetActive,
  className,
}: QuerySuggestionListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep active item scrolled into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className={cn(
        "z-[60] rounded-lg overflow-hidden shadow-dropdown border border-surface-border",
        "bg-surface-elevated backdrop-blur-sm",
        "max-h-[260px] overflow-y-auto",
        className
      )}
    >
      {suggestions.map((s, i) => (
        <button
          key={`${s.kind}-${s.label}-${i}`}
          ref={i === activeIndex ? activeRef : undefined}
          onMouseDown={(e) => {
            e.preventDefault(); // prevent input blur
            onAccept(s);
          }}
          onMouseEnter={() => onSetActive?.(i)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
            i === activeIndex
              ? "bg-brand/15 text-primary"
              : "text-secondary hover:bg-surface-tertiary"
          )}
        >
          <KindIcon kind={s.kind} detail={s.detail} />

          <span className={cn("text-tiny font-mono flex-1 truncate", KIND_COLOR[s.kind])}>
            {s.label}
          </span>

          {s.detail && s.kind === "field" && (
            <span className="text-[10px] text-muted shrink-0 font-mono opacity-70">{s.detail}</span>
          )}

          {s.kind === "correction" && (
            <span className="text-[10px] text-warning shrink-0 opacity-70">~fix</span>
          )}

          {i === activeIndex && (
            <kbd className="text-[9px] text-muted/50 shrink-0 font-sans">↵</kbd>
          )}
        </button>
      ))}
    </div>
  );
}
