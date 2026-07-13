"use client";

import { useState, useEffect } from "react";
import { X, Copy, Code2, Table2, BarChart2, BellPlus, Search, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { JsonTree } from "@/components/ui/json-tree";
import { SeverityPill } from "@/components/ui/severity-pill";
import { MitreBadge } from "@/components/ui/mitre-badge";
import ReactECharts from "echarts-for-react";
import { format } from "date-fns";
import type { LogEntry } from "./log-results-table";

type DrawerTab = "table" | "json" | "correlation";

export interface PivotAction {
  type: "create-alert" | "search-related" | "threat-intel";
  entry: LogEntry;
}

interface LogDetailDrawerProps {
  entry: LogEntry | null;
  onClose: () => void;
  onFilter: (field: string, value: string, exclude?: boolean) => void;
  onPivot?: (action: PivotAction) => void;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function severityFrom(entry: LogEntry): string | null {
  const raw = entry["severity"] ?? entry["event.severity"];
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (["critical", "high", "medium", "low", "info"].includes(s)) return s;
  return null;
}

function CorrelationChart({ entry }: { entry: LogEntry }) {
  const topFields = Object.entries(entry)
    .filter(([k, v]) => k !== "_id" && k !== "@timestamp" && typeof v === "string" && String(v).length < 80)
    .slice(0, 12);

  const option = {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#131920",
      borderColor: "#1E2D42",
      textStyle: { color: "#E2E8F0", fontSize: 12 },
    },
    grid: { left: 140, right: 20, top: 10, bottom: 10 },
    xAxis: {
      type: "value",
      show: false,
    },
    yAxis: {
      type: "category",
      data: topFields.map(([k]) => k),
      axisLabel: {
        color: "#64748B",
        fontSize: 11,
        fontFamily: "monospace",
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: "bar",
      barMaxWidth: 12,
      data: topFields.map(([, v]) => String(v).length),
      itemStyle: {
        color: "var(--brand-primary)",
        borderRadius: [0, 4, 4, 0],
        opacity: 0.7,
      },
      label: {
        show: true,
        position: "right",
        color: "#94A3B8",
        fontSize: 10,
        fontFamily: "monospace",
        formatter: (p: { dataIndex: number }) => {
          const val = String(topFields[p.dataIndex]?.[1] ?? "");
          return val.length > 30 ? val.slice(0, 30) + "…" : val;
        },
      },
    }],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(topFields.length * 28, 120) }}
      opts={{ renderer: "canvas" }}
    />
  );
}

export function LogDetailDrawer({ entry, onClose, onFilter, onPivot }: LogDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("table");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const copyJson = () => {
    if (!entry) return;
    navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!entry) return null;

  const sev = severityFrom(entry);
  const ts = entry["@timestamp"];
  const msg = entry["message"] as string | undefined;
  const tactic = entry["rule.mitre.tactic"] as string | undefined
    ?? entry["mitre.tactic"] as string | undefined;
  const technique = entry["rule.mitre.technique"] as string | undefined
    ?? entry["mitre.technique"] as string | undefined;
  const techniqueId = entry["rule.mitre.id"] as string | undefined;

  const tableRows = Object.entries(entry)
    .filter(([k]) => k !== "_id")
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col h-full border-t border-surface-border bg-surface-primary animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border shrink-0">
        {/* Severity */}
        {sev && (
          <SeverityPill severity={sev as never} size="sm" className="shrink-0" />
        )}

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <p className="text-small font-medium text-primary truncate">
            {msg ?? entry["event.action"] as string ?? "Log event"}
          </p>
          <p className="text-tiny text-muted mt-0.5">
            {ts ? format(new Date(String(ts)), "PPpp") : "No timestamp"}
            {(entry["host.name"] || entry["agent.name"]) && (
              <span className="ml-2 font-mono">
                · {String(entry["host.name"] ?? entry["agent.name"])}
              </span>
            )}
          </p>
        </div>

        {/* MITRE badge */}
        {tactic && (
          <MitreBadge
            tactic={tactic}
            technique={technique}
            techniqueId={techniqueId}
            size="sm"
            className="shrink-0"
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Pivot actions */}
          {onPivot && entry && (
            <>
              <button
                onClick={() => onPivot({ type: "create-alert", entry })}
                className="flex items-center gap-1 px-2 py-1 rounded text-tiny text-muted hover:text-warning hover:bg-warning/10 transition-colors"
                title="Create alert from this event"
              >
                <BellPlus className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Alert</span>
              </button>
              <button
                onClick={() => onPivot({ type: "search-related", entry })}
                className="flex items-center gap-1 px-2 py-1 rounded text-tiny text-muted hover:text-brand hover:bg-brand-subtle transition-colors"
                title="Search related events"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Related</span>
              </button>
              <button
                onClick={() => onPivot({ type: "threat-intel", entry })}
                className="flex items-center gap-1 px-2 py-1 rounded text-tiny text-muted hover:text-critical hover:bg-critical/10 transition-colors"
                title="Threat intelligence lookup"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">TI</span>
              </button>
              <div className="w-px h-4 bg-surface-border mx-0.5" />
            </>
          )}
          <button
            onClick={copyJson}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-tiny transition-colors",
              copied
                ? "text-success bg-success/10"
                : "text-muted hover:text-primary hover:bg-surface-tertiary"
            )}
            title="Copy as JSON"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "JSON"}
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0">
        {([
          { key: "table",       label: "Fields",      icon: <Table2 className="w-3.5 h-3.5" /> },
          { key: "json",        label: "JSON",         icon: <Code2 className="w-3.5 h-3.5" /> },
          { key: "correlation", label: "Field values",  icon: <BarChart2 className="w-3.5 h-3.5" /> },
        ] as { key: DrawerTab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-small transition-colors border-b-2",
              tab === t.key
                ? "text-primary border-brand"
                : "text-muted border-transparent hover:text-secondary"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "table" && (
          <div className="divide-y divide-surface-border/40">
            {tableRows.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center gap-2 px-4 py-2 hover:bg-surface-secondary/50 group"
              >
                <span className="text-tiny text-muted w-48 shrink-0 font-mono truncate">{k}</span>
                <span
                  className="flex-1 text-tiny text-primary font-mono truncate cursor-pointer hover:text-brand transition-colors"
                  title={formatValue(v)}
                  onClick={() => onFilter(k, formatValue(v), false)}
                >
                  {formatValue(v)}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => onFilter(k, formatValue(v), false)}
                    className="text-tiny text-muted hover:text-success px-1.5 py-0.5 rounded hover:bg-success/10 transition-colors"
                    title="Filter for"
                  >+</button>
                  <button
                    onClick={() => onFilter(k, formatValue(v), true)}
                    className="text-tiny text-muted hover:text-critical px-1.5 py-0.5 rounded hover:text-critical hover:bg-critical/10 transition-colors"
                    title="Filter out"
                  >−</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "json" && (
          <div className="p-4">
            <JsonTree data={entry as Record<string, unknown>} />
          </div>
        )}

        {tab === "correlation" && (
          <div className="p-4">
            <p className="text-tiny text-muted mb-3">Field value lengths (relative breadth indicator)</p>
            <CorrelationChart entry={entry} />
          </div>
        )}
      </div>
    </div>
  );
}
