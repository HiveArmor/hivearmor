"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Shield, Loader2, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ControlStatus = "pass" | "fail" | "partial" | "not_applicable" | "not_tested";

export interface ControlDomain {
  id: string;
  code: string;
  name: string;
  passRate: number;     // 0–100
  totalControls: number;
  passing: number;
  failing: number;
  partial: number;
}

export interface FrameworkData {
  id: string;
  backendId?: number;       // real DB id from /api/compliance/standard
  name: string;
  shortName: string;
  version?: string;
  overallScore: number;
  domains: ControlDomain[];
  lastEvaluated?: string;   // ISO timestamp of most recent control evaluation
}


// ── Colour helpers ────────────────────────────────────────────────────────────

function cellColor(pct: number): string {
  if (pct >= 90) return "bg-success/80 text-white";
  if (pct >= 75) return "bg-success/50 text-white";
  if (pct >= 60) return "bg-warning/50 text-white";
  if (pct >= 40) return "bg-warning/80 text-white";
  if (pct >= 20) return "bg-critical/50 text-white";
  return "bg-critical/80 text-white";
}

function scoreRingColor(pct: number): string {
  if (pct >= 85) return "text-success";
  if (pct >= 65) return "text-warning";
  return "text-critical";
}

// ── Framework tab ─────────────────────────────────────────────────────────────

function FrameworkTab({
  fw, active, onClick,
}: { fw: FrameworkData; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all shrink-0",
        active
          ? "border-brand bg-brand/10 shadow-glow"
          : "border-surface-border bg-surface-secondary hover:border-surface-border-focus hover:bg-surface-elevated"
      )}
    >
      <div className={cn("text-h4 font-bold", active ? "text-brand" : scoreRingColor(fw.overallScore))}>
        {fw.overallScore}%
      </div>
      <div>
        <p className={cn("text-small font-semibold leading-tight", active ? "text-primary" : "text-secondary")}>
          {fw.shortName}
        </p>
        <p className="text-tiny text-muted">{fw.domains.length} domains</p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ComplianceFrameworkHeatmapProps {
  frameworks?: FrameworkData[];
  activeId?: string;
  onFrameworkChange?: (id: string) => void;
  onDomainClick?: (domain: ControlDomain, framework: FrameworkData) => void;
  loadingDomains?: boolean;
}

export function ComplianceFrameworkHeatmap({
  frameworks = [],
  activeId: controlledActiveId,
  onFrameworkChange,
  onDomainClick,
  loadingDomains,
}: ComplianceFrameworkHeatmapProps) {
  const [internalActiveId, setInternalActiveId] = useState(frameworks[0]?.id ?? "");
  const activeId = controlledActiveId ?? internalActiveId;
  const setActiveId = (id: string) => {
    setInternalActiveId(id);
    onFrameworkChange?.(id);
  };
  const [hoverId, setHoverId] = useState<string | null>(null);

  const fw = frameworks.find((f) => f.id === activeId) ?? frameworks[0];

  if (frameworks.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[220px]">
        <AlertCircle className="w-8 h-8 text-muted" />
        <div>
          <p className="text-small font-medium text-secondary">No compliance frameworks configured</p>
          <p className="text-tiny text-muted mt-1">Add a framework standard in Settings to see posture data here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Framework selector */}
      <div className="px-4 pt-4 pb-3 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-brand" />
          <h3 className="text-small font-semibold text-primary">Framework Posture</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {frameworks.map((f) => (
            <FrameworkTab
              key={f.id}
              fw={f}
              active={activeId === f.id}
              onClick={() => setActiveId(f.id)}
            />
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-small text-secondary font-medium">{fw?.name}</p>
            {loadingDomains && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
            {fw?.lastEvaluated && !loadingDomains && (
              <span className="text-tiny text-muted">
                · evaluated {new Date(fw.lastEvaluated).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-tiny text-muted">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-success/80 inline-block" /> ≥90%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-warning/60 inline-block" /> 60–89%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-critical/70 inline-block" /> &lt;60%</span>
          </div>
        </div>

        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
          {(fw?.domains ?? []).map((domain) => (
            <button
              key={domain.id}
              onClick={() => fw && onDomainClick?.(domain, fw)}
              onMouseEnter={() => setHoverId(domain.id)}
              onMouseLeave={() => setHoverId(null)}
              className={cn(
                "relative flex flex-col items-start justify-between p-2.5 rounded-lg transition-all min-h-[80px]",
                cellColor(domain.passRate),
                hoverId === domain.id && "ring-2 ring-white/30 scale-[1.02] shadow-lg z-10"
              )}
            >
              {/* Code badge */}
              <div className="flex items-start justify-between w-full gap-1">
                <span className="text-tiny font-mono font-bold opacity-90 truncate">{domain.code}</span>
                <span className="text-h4 font-bold shrink-0">{domain.passRate}%</span>
              </div>

              {/* Domain name */}
              <p className="text-tiny opacity-90 leading-tight mt-1 line-clamp-2 text-left">{domain.name}</p>

              {/* Mini progress bar */}
              <div className="w-full mt-1.5">
                <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/70 rounded-full transition-all duration-500"
                    style={{ width: `${domain.passRate}%` }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-tiny opacity-70">{domain.passing}✓</span>
                  {domain.failing > 0 && <span className="text-tiny opacity-70">{domain.failing}✗</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
