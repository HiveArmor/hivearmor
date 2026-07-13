"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRight, ChevronDown, Filter, X,
  ExternalLink, Copy, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SeverityPill } from "@/components/ui/severity-pill";
import { format } from "date-fns";

export interface LogEntry {
  _id?: string;
  "@timestamp"?: string;
  message?: string;
  severity?: string;
  "source.ip"?: string;
  "destination.ip"?: string;
  "event.action"?: string;
  "host.name"?: string;
  "agent.name"?: string;
  [key: string]: unknown;
}

interface ContextMenu {
  x: number;
  y: number;
  field: string;
  value: string;
}

interface LogResultsTableProps {
  entries: LogEntry[];
  selectedFields: string[];
  totalHits: number;
  queryTime: number;
  loading?: boolean;
  onFilter: (field: string, value: string, exclude?: boolean) => void;
  onSelectEntry: (entry: LogEntry) => void;
  onColumnToggle: (field: string) => void;
  className?: string;
}

function formatTs(ts: unknown): string {
  if (!ts) return "—";
  try { return format(new Date(String(ts)), "MM-dd HH:mm:ss.SSS"); }
  catch { return String(ts); }
}

function severityFrom(entry: LogEntry): string | null {
  const raw = entry["severity"] ?? entry["event.severity"] ?? entry["logx.utm.severity"];
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (["critical", "high", "medium", "low", "info"].includes(s)) return s;
  const n = Number(raw);
  if (!isNaN(n)) {
    if (n >= 9) return "critical";
    if (n >= 7) return "high";
    if (n >= 4) return "medium";
    if (n >= 1) return "low";
    return "info";
  }
  return null;
}

function getCellValue(entry: LogEntry, field: string): string {
  const v = entry[field];
  if (v === undefined || v === null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function LogResultsTable({
  entries,
  selectedFields,
  totalHits,
  queryTime,
  loading,
  onFilter,
  onSelectEntry,
  onColumnToggle,
  className,
}: LogResultsTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [colPickerOpen, setColPickerOpen] = useState(false);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (expandedIdx === i ? 240 : 38),
    overscan: 20,
  });

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const handleCellContextMenu = useCallback(
    (e: React.MouseEvent, field: string, value: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, field, value });
    },
    []
  );

  const displayColumns = ["@timestamp", ...selectedFields.filter((f) => f !== "@timestamp")];

  if (loading) {
    return (
      <div className={cn("flex-1 overflow-hidden", className)}>
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-2.5 border-b border-surface-border/40">
            <div className="w-28 h-3.5 shimmer rounded" />
            <div className="flex-1 h-3.5 shimmer rounded" style={{ opacity: 1 - i * 0.05 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Table header */}
      <div className="flex items-center border-b border-surface-border bg-surface-secondary shrink-0">
        <div className="flex-none w-7 px-2" />
        {displayColumns.map((col) => (
          <div
            key={col}
            className={cn(
              "px-3 py-2 text-tiny font-medium text-muted uppercase tracking-wider truncate",
              col === "@timestamp" ? "w-[160px] shrink-0" : "flex-1 min-w-0"
            )}
          >
            {col}
          </div>
        ))}
        {/* Column picker */}
        <div className="flex-none px-2 relative">
          <button
            onClick={() => setColPickerOpen(!colPickerOpen)}
            className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary"
            title="Configure columns"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          {colPickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColPickerOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-52 card shadow-dropdown py-1 animate-scale-in">
                <div className="px-3 py-2 border-b border-surface-border">
                  <p className="text-tiny font-medium text-primary">Visible columns</p>
                </div>
                {selectedFields.map((f) => (
                  <button
                    key={f}
                    onClick={() => onColumnToggle(f)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
                  >
                    <span className={cn(
                      "w-3.5 h-3.5 rounded flex items-center justify-center border text-tiny",
                      "bg-brand border-brand text-white"
                    )}>✓</span>
                    {f}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Virtual scroll body */}
      <div ref={parentRef} className="flex-1 overflow-y-auto font-mono text-small">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const entry = entries[vi.index];
            const expanded = expandedIdx === vi.index;
            const sev = severityFrom(entry);

            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{ position: "absolute", top: vi.start, width: "100%" }}
                className={cn(
                  "border-b border-surface-border/40",
                  sev === "critical" && "bg-critical-subtle/10",
                  sev === "high"     && "bg-[var(--color-high-subtle)]/10",
                )}
              >
                {/* Row */}
                <div
                  className="flex items-center hover:bg-surface-secondary/60 transition-colors cursor-pointer group"
                  onClick={() => {
                    setExpandedIdx(expanded ? null : vi.index);
                    if (!expanded) onSelectEntry(entry);
                  }}
                >
                  {/* Expand toggle */}
                  <div className="flex-none w-7 flex items-center justify-center">
                    {expanded
                      ? <ChevronDown className="w-3 h-3 text-muted" />
                      : <ChevronRight className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    }
                  </div>

                  {/* Timestamp */}
                  <div className="w-[160px] shrink-0 px-3 py-2.5 text-muted whitespace-nowrap">
                    {formatTs(entry["@timestamp"])}
                  </div>

                  {/* Dynamic columns */}
                  {selectedFields.map((col) => (
                    <div
                      key={col}
                      className="flex-1 min-w-0 px-3 py-2.5 truncate"
                      onContextMenu={(e) => handleCellContextMenu(e, col, getCellValue(entry, col))}
                    >
                      {col === "severity" && sev ? (
                        <SeverityPill severity={sev as never} size="sm" />
                      ) : (
                        <span className={cn(
                          col === "message" ? "text-primary" : "text-secondary"
                        )}>
                          {getCellValue(entry, col)}
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Open detail */}
                  <div className="flex-none px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectEntry(entry); }}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary"
                      title="Open detail"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Expanded inline preview */}
                {expanded && (
                  <div className="px-8 py-3 bg-surface-elevated border-t border-surface-border/40">
                    <div className="grid gap-y-0.5 grid-cols-[200px_1fr]">
                      {Object.entries(entry)
                        .filter(([k]) => k !== "_id")
                        .slice(0, 20)
                        .map(([k]) => (
                          <div key={k} className="contents">
                            <span className="text-tiny text-muted py-0.5 truncate pr-2">{k}</span>
                            <div className="flex items-center gap-1.5 py-0.5 min-w-0">
                              <span
                                className="text-tiny text-primary truncate flex-1 cursor-pointer hover:text-brand transition-colors"
                                onContextMenu={(e) => handleCellContextMenu(e, k, getCellValue(entry, k))}
                                onClick={() => onFilter(k, getCellValue(entry, k))}
                              >
                                {getCellValue(entry, k)}
                              </span>
                              <div className="flex gap-0.5 shrink-0 opacity-0 hover:opacity-100">
                                <button onClick={() => onFilter(k, getCellValue(entry, k), false)} className="text-tiny text-muted hover:text-success px-1">+</button>
                                <button onClick={() => onFilter(k, getCellValue(entry, k), true)}  className="text-tiny text-muted hover:text-critical px-1">−</button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-surface-border bg-surface-secondary text-tiny text-muted shrink-0">
        <div className="flex items-center gap-4">
          <span><span className="text-primary font-medium">{totalHits.toLocaleString()}</span> hits</span>
          <span>in {queryTime}ms</span>
          {totalHits > 0 && queryTime > 0 && (
            <span>{Math.round(totalHits / Math.max(queryTime / 1000, 0.001)).toLocaleString()} events/sec</span>
          )}
        </div>
        <span>Showing {Math.min(entries.length, totalHits).toLocaleString()} of {totalHits.toLocaleString()}</span>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] w-52 card shadow-dropdown py-1 animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-surface-border">
            <p className="text-tiny text-muted truncate font-mono">{contextMenu.field}</p>
            <p className="text-tiny text-primary truncate mt-0.5">{contextMenu.value}</p>
          </div>
          <button
            onClick={() => { onFilter(contextMenu.field, contextMenu.value, false); setContextMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
          >
            <Filter className="w-3.5 h-3.5 text-success" /> Filter for value
          </button>
          <button
            onClick={() => { onFilter(contextMenu.field, contextMenu.value, true); setContextMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
          >
            <X className="w-3.5 h-3.5 text-critical" /> Filter out value
          </button>
          <div className="border-t border-surface-border/50 mt-1 pt-1">
            <button
              onClick={() => { navigator.clipboard.writeText(contextMenu.value); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary"
            >
              <Copy className="w-3.5 h-3.5" /> Copy value
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
