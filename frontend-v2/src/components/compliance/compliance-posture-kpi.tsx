"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

// ── Sparkline (pure SVG) ──────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 64, h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const area = `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(" ") + ` L${w},${h} L0,${h} Z`;
  const line = `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible shrink-0">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Donut ─────────────────────────────────────────────────────────────────────

function Donut({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-tertiary)" strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Delta badge ───────────────────────────────────────────────────────────────

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-tiny text-muted">±0</span>;
  return (
    <span className={cn("text-tiny font-medium", value > 0 ? "text-success" : "text-critical")}>
      {value > 0 ? "+" : ""}{value}
    </span>
  );
}

export interface CompliancePostureKPIData {
  overallScore: number;           // 0–100
  scoreDelta: number;
  passingControls: number;
  passingDelta: number;
  failingControls: number;
  failingDelta: number;
  overdueReviews: number;
  overdueDelta: number;
  totalControls: number;
}

// ── Score colour ──────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 85) return "#22c55e";   // success green
  if (pct >= 65) return "#f59e0b";   // warning amber
  return "#ef4444";                  // critical red
}

// ── Main component ────────────────────────────────────────────────────────────

interface CompliancePostureKPIProps {
  data?: CompliancePostureKPIData;
}

export function CompliancePostureKPI({ data }: CompliancePostureKPIProps) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 bg-surface-tertiary rounded w-1/2 mb-3" />
            <div className="h-8 bg-surface-tertiary rounded w-1/3 mb-2" />
            <div className="h-3 bg-surface-tertiary rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  const pct = data.overallScore;
  const color = scoreColor(pct);

  // Flat single-point sparklines derived from current values — no fabricated history
  const spark = {
    score:   [pct],
    passing: [data.passingControls],
    failing: [data.failingControls],
    overdue: [data.overdueReviews],
  };

  const cards = [
    {
      key: "score",
      label: "Overall Score",
      value: `${pct}%`,
      delta: data.scoreDelta,
      sub: `${data.passingControls} / ${data.totalControls} controls`,
      icon: (
        <div className="relative flex items-center justify-center">
          <Donut pct={pct} color={color} />
          <span className="absolute text-tiny font-bold" style={{ color }}>{pct}</span>
        </div>
      ),
      spark: spark.score,
      sparkColor: color,
      accent: color,
    },
    {
      key: "passing",
      label: "Controls Passing",
      value: String(data.passingControls),
      delta: data.passingDelta,
      sub: "of " + data.totalControls + " total",
      icon: <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-success" /></div>,
      spark: spark.passing,
      sparkColor: "#22c55e",
      accent: "var(--color-success)",
    },
    {
      key: "failing",
      label: "Controls Failing",
      value: String(data.failingControls),
      delta: data.failingDelta,
      sub: "need remediation",
      icon: <div className="w-9 h-9 rounded-xl bg-critical/15 flex items-center justify-center"><XCircle className="w-5 h-5 text-critical" /></div>,
      spark: spark.failing,
      sparkColor: "#ef4444",
      accent: "var(--color-critical)",
    },
    {
      key: "overdue",
      label: "Overdue Reviews",
      value: String(data.overdueReviews),
      delta: data.overdueDelta,
      sub: "past due date",
      icon: <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center"><Clock className="w-5 h-5 text-warning" /></div>,
      spark: spark.overdue,
      sparkColor: "#f59e0b",
      accent: "var(--color-warning)",
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="card p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-tiny text-muted">{c.label}</p>
              <p className="text-h2 font-bold text-primary mt-0.5 leading-none">{c.value}</p>
              <p className="text-tiny text-muted mt-1">{c.sub}</p>
            </div>
            {c.icon}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Delta value={c.delta} />
              <span className="text-tiny text-muted">vs last month</span>
            </div>
            <Sparkline data={c.spark} color={c.sparkColor} />
          </div>
        </div>
      ))}
    </div>
  );
}
