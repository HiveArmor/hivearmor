"use client";

import { useState, type ReactNode } from "react";
import {
  CheckCircle2, XCircle, Clock, Loader2,
  ChevronDown, ChevronRight, History, Play,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecStatus } from "./playbook-nodes";

export interface ExecStepLog {
  stepId: string;
  nodeLabel: string;
  nodeKind: string;
  status: ExecStatus;
  startedAt: number;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

export interface PlaybookRun {
  runId: string;
  playbookName: string;
  trigger: string;
  startedAt: number;
  endedAt?: number;
  status: "running" | "success" | "error" | "aborted";
  steps: ExecStepLog[];
}

const STATUS_ICON: Record<string, ReactNode> = {
  idle:    <Clock className="w-3.5 h-3.5 text-muted" />,
  running: <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />,
  success: <CheckCircle2 className="w-3.5 h-3.5 text-success" />,
  error:   <XCircle className="w-3.5 h-3.5 text-critical" />,
  skipped: <Clock className="w-3.5 h-3.5 text-muted opacity-50" />,
};

const RUN_STATUS_META: Record<string, { label: string; color: string; icon: ReactNode }> = {
  running: { label: "Running",  color: "text-brand",    icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  success: { label: "Success",  color: "text-success",  icon: <CheckCircle2 className="w-3 h-3" /> },
  error:   { label: "Failed",   color: "text-critical", icon: <XCircle className="w-3 h-3" /> },
  aborted: { label: "Aborted",  color: "text-warning",  icon: <AlertTriangle className="w-3 h-3" /> },
};

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const DEMO_RUNS: PlaybookRun[] = [
  {
    runId: "run-1720001234",
    playbookName: "Brute Force Response",
    trigger: "Alert #4821 — alert.created",
    startedAt: Date.now() - 180_000,
    endedAt: Date.now() - 177_200,
    status: "success",
    steps: [
      { stepId: "t1", nodeLabel: "Alert Received",     nodeKind: "trigger",   status: "success", startedAt: Date.now() - 180_000, durationMs: 12 },
      { stepId: "c1", nodeLabel: "Severity ≥ High?",   nodeKind: "condition", status: "success", startedAt: Date.now() - 179_980, durationMs: 8,   output: { result: true } },
      { stepId: "a1", nodeLabel: "Enrich Attacker IP", nodeKind: "action",    status: "success", startedAt: Date.now() - 179_960, durationMs: 1200, output: { score: 92, tags: ["malware", "botnet"] } },
      { stepId: "a2", nodeLabel: "Block IP",           nodeKind: "action",    status: "success", startedAt: Date.now() - 178_700, durationMs: 340 },
      { stepId: "a3", nodeLabel: "Notify SOC",         nodeKind: "action",    status: "success", startedAt: Date.now() - 178_340, durationMs: 660 },
    ],
  },
  {
    runId: "run-1719998000",
    playbookName: "IOC Enrichment",
    trigger: "Alert #4816 — alert.created",
    startedAt: Date.now() - 3_600_000,
    endedAt: Date.now() - 3_597_400,
    status: "error",
    steps: [
      { stepId: "t1", nodeLabel: "New Alert",   nodeKind: "trigger", status: "success", startedAt: Date.now() - 3_600_000, durationMs: 10 },
      { stepId: "a1", nodeLabel: "Query VT",    nodeKind: "action",  status: "success", startedAt: Date.now() - 3_599_980, durationMs: 800 },
      { stepId: "a2", nodeLabel: "Query Shodan",nodeKind: "action",  status: "error",   startedAt: Date.now() - 3_599_160, durationMs: 2200, error: "Connection timeout: api.shodan.io" },
      { stepId: "a3", nodeLabel: "Tag Alert",   nodeKind: "action",  status: "skipped", startedAt: Date.now() - 3_596_940, durationMs: 0 },
    ],
  },
];

interface StepRowProps {
  step: ExecStepLog;
}

function StepRow({ step }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!step.output || !!step.error;
  return (
    <div className="border-b border-surface-border/50 last:border-0">
      <button
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-tertiary",
          step.status === "error" && "bg-critical/5"
        )}
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
      >
        <span className="shrink-0">{STATUS_ICON[step.status as string] ?? STATUS_ICON["idle"]}</span>
        <span className="flex-1 min-w-0 text-small text-secondary truncate">{step.nodeLabel}</span>
        <span className="text-tiny text-muted font-mono shrink-0">{formatDuration(step.durationMs)}</span>
        {hasDetail && (
          expanded
            ? <ChevronDown className="w-3 h-3 text-muted shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted shrink-0" />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="px-4 pb-3 space-y-1.5 bg-surface-tertiary/30">
          {step.error && (
            <div className="text-tiny font-mono text-critical bg-critical/5 border border-critical/20 rounded px-2 py-1.5">
              Error: {step.error}
            </div>
          )}
          {step.output != null && (
            <div className="text-tiny font-mono text-muted bg-surface-tertiary rounded px-2 py-1.5 overflow-x-auto whitespace-pre">
              {JSON.stringify(step.output, null, 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RunSectionProps {
  run: PlaybookRun;
  defaultOpen?: boolean;
}

function RunSection({ run, defaultOpen }: RunSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const statusMeta = RUN_STATUS_META[run.status];
  const totalDuration = run.endedAt ? run.endedAt - run.startedAt : undefined;
  const completedSteps = run.steps.filter((s) => s.status === "success").length;

  return (
    <div className="border border-surface-border rounded-lg overflow-hidden mb-2">
      {/* Run header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface-secondary hover:bg-surface-elevated transition-colors text-left"
      >
        <span className={cn("flex items-center gap-1 shrink-0", statusMeta.color)}>
          {statusMeta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-small font-medium text-primary truncate">{run.playbookName}</p>
          <p className="text-tiny text-muted truncate">{run.trigger}</p>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          <p className={cn("text-tiny font-medium", statusMeta.color)}>{statusMeta.label}</p>
          <p className="text-tiny text-muted">{formatTime(run.startedAt)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-tiny text-muted">{formatDuration(totalDuration)}</p>
          <p className="text-tiny text-muted">{completedSteps}/{run.steps.length} steps</p>
        </div>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
        }
      </button>

      {open && (
        <div className="bg-surface-primary divide-y-0">
          {/* Step timeline bar */}
          {totalDuration && (
            <div className="px-3 py-2 flex gap-0.5 border-b border-surface-border">
              {run.steps.map((s) => {
                const w = totalDuration ? ((s.durationMs ?? 0) / totalDuration) * 100 : 0;
                return (
                  <div
                    key={s.stepId}
                    title={`${s.nodeLabel}: ${formatDuration(s.durationMs)}`}
                    style={{ width: `${Math.max(w, 2)}%` }}
                    className={cn(
                      "h-1.5 rounded-full",
                      s.status === "success" ? "bg-success" :
                      s.status === "error"   ? "bg-critical" :
                      s.status === "running" ? "bg-brand animate-pulse" : "bg-surface-border"
                    )}
                  />
                );
              })}
            </div>
          )}
          {run.steps.map((step) => <StepRow key={step.stepId} step={step} />)}
        </div>
      )}
    </div>
  );
}

interface PlaybookExecutionLogProps {
  runs?: PlaybookRun[];
  activeRun?: PlaybookRun | null;
  className?: string;
}

export function PlaybookExecutionLog({ runs, activeRun, className }: PlaybookExecutionLogProps) {
  const [tab, setTab] = useState<"active" | "history">("active");
  const allRuns = runs ?? DEMO_RUNS;

  return (
    <div className={cn("flex flex-col h-full overflow-hidden border-t border-surface-border bg-surface-primary", className)}>
      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-border shrink-0">
        <button
          onClick={() => setTab("active")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded text-tiny transition-colors",
            tab === "active" ? "bg-surface-tertiary text-primary" : "text-muted hover:text-secondary"
          )}
        >
          <Play className="w-3 h-3" /> Active Run
          {activeRun?.status === "running" && (
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setTab("history")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded text-tiny transition-colors",
            tab === "history" ? "bg-surface-tertiary text-primary" : "text-muted hover:text-secondary"
          )}
        >
          <History className="w-3 h-3" /> History
          <span className="text-tiny text-muted">({allRuns.length})</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === "active" && (
          activeRun ? (
            <RunSection run={activeRun} defaultOpen />
          ) : (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Play className="w-6 h-6 text-muted" />
              <p className="text-tiny text-muted">No active run. Press Run to execute.</p>
            </div>
          )
        )}

        {tab === "history" && (
          allRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <History className="w-6 h-6 text-muted" />
              <p className="text-tiny text-muted">No execution history yet.</p>
            </div>
          ) : (
            allRuns.map((r, i) => <RunSection key={r.runId} run={r} defaultOpen={i === 0} />)
          )
        )}
      </div>
    </div>
  );
}
