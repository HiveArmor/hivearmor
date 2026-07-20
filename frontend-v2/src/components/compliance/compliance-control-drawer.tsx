"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  X, CheckCircle2, XCircle, MinusCircle, HelpCircle,
  ChevronRight, FileText, AlertTriangle,
  BookOpen, Zap, Loader2, RefreshCw,
} from "lucide-react";
import { ComplianceEvidencePanel } from "./evidence-panel";
import { cn } from "@/lib/utils";
import {
  complianceService,
  normalizeStatus,
  type ComplianceSection,
  type ComplianceControlLatestEvaluation,
  type EvalStatus,
} from "@/services/compliance.service";
import { ComplianceEvalHistoryChart } from "./compliance-eval-history-chart";
import type { ControlDomain, FrameworkData } from "./compliance-framework-heatmap";

// ── Types ─────────────────────────────────────────────────────────────────────

// View stack: framework → section list → control list → control detail
type DrawerView =
  | { kind: "sections" }
  | { kind: "controls"; section: ComplianceSection }
  | { kind: "detail"; control: ComplianceControlLatestEvaluation };

// ── Status metadata ───────────────────────────────────────────────────────────

const RESULT_META: Record<EvalStatus, { icon: ReactNode; label: string; color: string; bg: string }> = {
  PASS:          { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Pass",          color: "text-success",  bg: "bg-success/10 border-success/25" },
  FAIL:          { icon: <XCircle className="w-3.5 h-3.5" />,      label: "Fail",          color: "text-critical", bg: "bg-critical/10 border-critical/25" },
  PARTIAL:       { icon: <MinusCircle className="w-3.5 h-3.5" />,  label: "Partial",       color: "text-warning",  bg: "bg-warning/10 border-warning/25" },
  NOT_EVALUATED: { icon: <HelpCircle className="w-3.5 h-3.5" />,   label: "Not Evaluated", color: "text-muted",    bg: "bg-surface-tertiary border-surface-border" },
};

// ── Section list view ─────────────────────────────────────────────────────────

function SectionList({
  standardId,
  onSelectSection,
}: {
  standardId: number;
  onSelectSection: (section: ComplianceSection) => void;
}) {
  const [sections, setSections] = useState<ComplianceSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    complianceService
      .getSections(standardId)
      .then(setSections)
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, [standardId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-small">Loading sections…</span>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <BookOpen className="w-6 h-6 text-muted" />
        <p className="text-small text-muted">No sections found for this framework.</p>
      </div>
    );
  }

  return (
    <div>
      {sections.map((sec) => (
        <button
          key={sec.id}
          onClick={() => onSelectSection(sec)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-surface-border/60 last:border-0 hover:bg-surface-tertiary/40 transition-colors group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-small text-primary font-medium truncate">{sec.standardSectionName}</p>
            {sec.standardSectionDescription && (
              <p className="text-tiny text-muted mt-0.5 line-clamp-1">{sec.standardSectionDescription}</p>
            )}
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0 group-hover:text-primary transition-colors" />
        </button>
      ))}
    </div>
  );
}

// ── Control list view ─────────────────────────────────────────────────────────

function ControlList({
  section,
  onSelectControl,
}: {
  section: ComplianceSection;
  onSelectControl: (ctrl: ComplianceControlLatestEvaluation) => void;
}) {
  const [controls, setControls] = useState<ComplianceControlLatestEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EvalStatus | "all">("all");

  useEffect(() => {
    setLoading(true);
    complianceService
      .getControlsWithLatestEval(section.id)
      .then(setControls)
      .catch(() => setControls([]))
      .finally(() => setLoading(false));
  }, [section.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 gap-2 text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-small">Loading controls…</span>
      </div>
    );
  }

  const filtered =
    filter === "all"
      ? controls
      : controls.filter((c) => normalizeStatus(c.lastEvaluationStatus) === filter);

  const countByStatus = controls.reduce<Record<string, number>>((acc, c) => {
    const s = normalizeStatus(c.lastEvaluationStatus);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Filter chips */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-surface-border flex-wrap">
        {([["all", "All", undefined], ["PASS", "Pass", "success"], ["FAIL", "Fail", "critical"], ["PARTIAL", "Partial", "warning"], ["NOT_EVALUATED", "Not Tested", undefined]] as const).map(
          ([key, label, color]) => (
            <button
              key={key}
              onClick={() => setFilter(key as EvalStatus | "all")}
              className={cn(
                "px-2.5 py-1 rounded-full text-tiny transition-colors border",
                filter === key
                  ? color === "success"
                    ? "bg-success/15 text-success border-success/25"
                    : color === "critical"
                    ? "bg-critical/15 text-critical border-critical/25"
                    : color === "warning"
                    ? "bg-warning/15 text-warning border-warning/25"
                    : "bg-brand-subtle text-brand border-brand/25"
                  : "text-muted border-surface-border hover:bg-surface-tertiary"
              )}
            >
              {label}
              {key !== "all" && countByStatus[key] != null && (
                <span className="ml-1 opacity-70">({countByStatus[key]})</span>
              )}
            </button>
          )
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2">
          <AlertTriangle className="w-5 h-5 text-muted" />
          <p className="text-small text-muted">No controls match this filter.</p>
        </div>
      ) : (
        <div>
          {filtered.map((ctrl) => {
            const status = normalizeStatus(ctrl.lastEvaluationStatus);
            const meta = RESULT_META[status];
            return (
              <button
                key={ctrl.id}
                onClick={() => onSelectControl(ctrl)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-surface-border/60 last:border-0 hover:bg-surface-tertiary/40 transition-colors group"
              >
                <span className={cn("shrink-0", meta.color)}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-small text-primary truncate">{ctrl.controlName}</p>
                  <p className="text-tiny text-muted mt-0.5">{ctrl.controlStrategy}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny border", meta.color, meta.bg)}>
                    {meta.label}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Control detail view ───────────────────────────────────────────────────────

function ControlDetail({
  control,
  onRefresh,
}: {
  control: ComplianceControlLatestEvaluation;
  onRefresh: (updated: ComplianceControlLatestEvaluation) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const status = normalizeStatus(control.lastEvaluationStatus);
  const meta = RESULT_META[status];

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await complianceService.getControlWithLatestEval(control.id);
      onRefresh(updated);
    } catch {
      // silently ignore
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Status banner */}
      <div className={cn("flex items-center gap-3 p-3 rounded-lg border", meta.bg)}>
        <span className={cn("shrink-0", meta.color)}>{meta.icon}</span>
        <div className="flex-1">
          <p className={cn("text-small font-semibold", meta.color)}>{meta.label}</p>
          {control.lastEvaluationTimestamp && (
            <p className="text-tiny text-muted mt-0.5">
              Last evaluated:{" "}
              {new Date(control.lastEvaluationTimestamp).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh latest evaluation"
          className="btn btn-secondary btn-sm flex items-center gap-1.5"
        >
          <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Strategy */}
      <div>
        <p className="text-tiny font-semibold text-secondary mb-1">Evaluation Strategy</p>
        <span className="px-2 py-0.5 rounded text-tiny font-mono bg-surface-tertiary text-secondary border border-surface-border">
          {control.controlStrategy}
        </span>
        <p className="text-tiny text-muted mt-1">
          {control.controlStrategy === "ALL"
            ? "All sub-queries must pass for this control to pass."
            : "Any passing sub-query marks this control as passing."}
        </p>
      </div>

      {/* Solution */}
      {control.controlSolution && (
        <div>
          <p className="text-tiny font-semibold text-secondary flex items-center gap-1.5 mb-1">
            <FileText className="w-3 h-3 text-brand" /> Solution
          </p>
          <p className="text-tiny text-muted leading-relaxed">{control.controlSolution}</p>
        </div>
      )}

      {/* Remediation */}
      {control.controlRemediation && (
        <div>
          <p className="text-tiny font-semibold text-secondary flex items-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-warning" /> Remediation
          </p>
          <p className="text-tiny text-muted leading-relaxed">{control.controlRemediation}</p>
        </div>
      )}

      {/* Evaluation history chart */}
      <div className="pt-1">
        <ComplianceEvalHistoryChart controlId={control.id} />
      </div>

      {/* Evidence drilldown */}
      <div className="pt-2 border-t border-surface-border">
        <ComplianceEvidencePanel controlId={control.id} />
      </div>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ domain }: { domain: ControlDomain }) {
  const total = domain.totalControls;
  const passW = (domain.passing / total) * 100;
  const failW = (domain.failing / total) * 100;
  const partW = (domain.partial / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
        <div className="bg-success transition-all duration-500" style={{ width: `${passW}%` }} />
        <div className="bg-warning transition-all duration-500" style={{ width: `${partW}%` }} />
        <div className="bg-critical transition-all duration-500" style={{ width: `${failW}%` }} />
        <div className="flex-1 bg-surface-border" />
      </div>
      <div className="flex items-center gap-3 text-tiny text-muted">
        <span className="text-success">{domain.passing} pass</span>
        {domain.partial > 0 && <span className="text-warning">{domain.partial} partial</span>}
        <span className="text-critical">{domain.failing} fail</span>
        <span className="ml-auto">{domain.totalControls} total</span>
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

interface ComplianceControlDrawerProps {
  domain: ControlDomain | null;
  framework: FrameworkData | null;
  onClose: () => void;
}

export function ComplianceControlDrawer({
  domain,
  framework,
  onClose,
}: ComplianceControlDrawerProps) {
  const [viewStack, setViewStack] = useState<DrawerView[]>([{ kind: "sections" }]);

  // Reset stack when the domain changes
  useEffect(() => {
    setViewStack([{ kind: "sections" }]);
  }, [domain?.id]);

  if (!domain || !framework) return null;

  const activeDomain = domain;
  const current = viewStack[viewStack.length - 1];

  const push = (view: DrawerView) => setViewStack((s) => [...s, view]);
  const pop = () => setViewStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  // Build breadcrumb label for the current view
  function breadcrumbTitle(): string {
    if (current.kind === "sections") return activeDomain.name;
    if (current.kind === "controls") return current.section.standardSectionName;
    return current.control.controlName;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[50]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[520px] z-[60] bg-surface-primary border-l border-surface-border shadow-drawer flex flex-col animate-slide-in-right overflow-hidden">

        {/* Header */}
        <div className="px-4 py-4 border-b border-surface-border shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Breadcrumbs */}
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                <span className="text-tiny font-mono text-muted">{framework.shortName}</span>
                <span className="text-muted">·</span>
                <span className="text-tiny font-mono text-brand">{domain.code}</span>
                {current.kind === "controls" && (
                  <>
                    <span className="text-muted">·</span>
                    <span className="text-tiny text-muted truncate max-w-[140px]">
                      {current.section.standardSectionName}
                    </span>
                  </>
                )}
                {current.kind === "detail" && (
                  <>
                    <span className="text-muted">·</span>
                    <span className="text-tiny text-muted truncate max-w-[140px]">
                      {(viewStack[viewStack.length - 2] as { kind: "controls"; section: ComplianceSection })?.section?.standardSectionName ?? ""}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-h3 font-bold text-primary leading-tight line-clamp-2">
                {breadcrumbTitle()}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className={cn(
                "text-h2 font-bold",
                domain.passRate >= 85 ? "text-success" : domain.passRate >= 65 ? "text-warning" : "text-critical"
              )}>
                {domain.passRate}%
              </div>
              <button onClick={onClose} className="toolbar-btn">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {current.kind === "sections" && <SummaryBar domain={activeDomain} />}

          {/* Back button */}
          {viewStack.length > 1 && (
            <button
              onClick={pop}
              className="flex items-center gap-1 text-tiny text-brand hover:text-brand/80 transition-colors"
            >
              <ChevronRight className="w-3 h-3 rotate-180" />
              Back
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {current.kind === "sections" && (
            <SectionList
              standardId={framework.backendId ?? 0}
              onSelectSection={(sec) => push({ kind: "controls", section: sec })}
            />
          )}

          {current.kind === "controls" && (
            <ControlList
              section={current.section}
              onSelectControl={(ctrl) => push({ kind: "detail", control: ctrl })}
            />
          )}

          {current.kind === "detail" && (
            <ControlDetail
              control={current.control}
              onRefresh={(updated) => {
                setViewStack((s) => {
                  const next = [...s];
                  next[next.length - 1] = { kind: "detail", control: updated };
                  return next;
                });
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
