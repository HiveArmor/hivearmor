"use client";

import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  complianceService,
  normalizeStatus,
  type ComplianceControlEvaluationGrouped,
  type EvalStatus,
} from "@/services/compliance.service";

// ── Colour map ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<EvalStatus, string> = {
  PASS:          "#22c55e",
  FAIL:          "#ef4444",
  PARTIAL:       "#f59e0b",
  NOT_EVALUATED: "#6b7280",
};

const STATUS_LABEL: Record<EvalStatus, string> = {
  PASS:          "Pass",
  FAIL:          "Fail",
  PARTIAL:       "Partial",
  NOT_EVALUATED: "Not Evaluated",
};

// ── Timeline dot ──────────────────────────────────────────────────────────────

function TimelineDot({
  entry,
  hovered,
  onEnter,
  onLeave,
}: {
  entry: ComplianceControlEvaluationGrouped;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const status = normalizeStatus(entry.status);
  const color = STATUS_COLOR[status];

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer group"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* connector line drawn via parent flex gap */}
      <div
        className="w-3 h-3 rounded-full border-2 transition-transform duration-150"
        style={{
          backgroundColor: color,
          borderColor: color,
          transform: hovered ? "scale(1.5)" : "scale(1)",
        }}
      />
      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-5 z-30 bg-surface-primary border border-surface-border rounded-lg shadow-dropdown px-2.5 py-2 pointer-events-none whitespace-nowrap animate-scale-in">
          <p className="text-tiny font-semibold" style={{ color }}>
            {STATUS_LABEL[status]}
          </p>
          <p className="text-tiny text-muted mt-0.5">
            {new Date(entry.timestamp).toLocaleDateString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ComplianceEvalHistoryChartProps {
  controlId: number;
}

export function ComplianceEvalHistoryChart({ controlId }: ComplianceEvalHistoryChartProps) {
  const [entries, setEntries] = useState<ComplianceControlEvaluationGrouped[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    complianceService
      .getControlEvaluationHistory(controlId)
      .then((res) => {
        setEntries(res.evaluations ?? []);
        setStartDate(res.startDate ?? null);
        setEndDate(res.endDate ?? null);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [controlId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-tiny text-muted py-3">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading history…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-tiny text-muted py-2 italic">No evaluation history available.</p>
    );
  }

  // Count pass/fail for summary
  const counts = entries.reduce<Record<EvalStatus, number>>(
    (acc, e) => {
      const s = normalizeStatus(e.status);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    { PASS: 0, FAIL: 0, PARTIAL: 0, NOT_EVALUATED: 0 }
  );

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-tiny font-semibold text-secondary">
          <History className="w-3 h-3 text-brand" />
          Evaluation History
        </div>
        <div className="flex items-center gap-2 text-tiny text-muted">
          {startDate && endDate && (
            <span>
              {new Date(startDate).toLocaleDateString([], { month: "short", day: "numeric" })}
              {" – "}
              {new Date(endDate).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
          )}
          <span>{entries.length} evals</span>
        </div>
      </div>

      {/* Timeline strip */}
      <div className="relative bg-surface-tertiary rounded-lg px-3 py-3 overflow-visible">
        {/* Horizontal connector line */}
        <div className="absolute inset-x-3 top-[calc(50%+2px)] h-px bg-surface-border" />

        {/* Dots */}
        <div className="relative flex items-center justify-between gap-0">
          {entries.map((entry, i) => (
            <TimelineDot
              key={i}
              entry={entry}
              hovered={hoveredIdx === i}
              onEnter={() => setHoveredIdx(i)}
              onLeave={() => setHoveredIdx(null)}
            />
          ))}
        </div>

        {/* Date labels at start/end */}
        <div className="flex justify-between mt-1.5">
          <span className="text-tiny text-muted font-mono">
            {new Date(entries[0].timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
          <span className="text-tiny text-muted font-mono">
            {new Date(entries[entries.length - 1].timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["PASS", "FAIL", "PARTIAL", "NOT_EVALUATED"] as EvalStatus[])
          .filter((s) => counts[s] > 0)
          .map((s) => (
            <span
              key={s}
              className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny border")}
              style={{
                color: STATUS_COLOR[s],
                borderColor: STATUS_COLOR[s] + "40",
                backgroundColor: STATUS_COLOR[s] + "18",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ backgroundColor: STATUS_COLOR[s] }}
              />
              {STATUS_LABEL[s]} ({counts[s]})
            </span>
          ))}
      </div>
    </div>
  );
}
