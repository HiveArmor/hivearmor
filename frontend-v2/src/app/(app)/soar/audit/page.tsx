"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList, CheckCircle2, XCircle, AlertCircle, Loader2,
  ChevronDown, ChevronRight, Briefcase, Trash2,
} from "lucide-react";
import { playbookService, type PlaybookExecution } from "@/services/playbook.service";
import {
  incidentResponseService,
  type IncidentJob,
  jobStatusLabel,
  type IncidentJobStatus,
} from "@/services/incident-response.service";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

// ─── Shared status badge ──────────────────────────────────────────────────────

const EXEC_STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SUCCESS:  { label: "Success",  color: "text-success",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ERROR:    { label: "Error",    color: "text-critical", icon: <XCircle className="w-3.5 h-3.5" /> },
  ABORTED:  { label: "Aborted",  color: "text-warning",  icon: <AlertCircle className="w-3.5 h-3.5" /> },
  RUNNING:  { label: "Running",  color: "text-brand",    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  PENDING:  { label: "Pending",  color: "text-muted",    icon: <Loader2 className="w-3.5 h-3.5" /> },
  EXECUTED: { label: "Executed", color: "text-success",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

function StatusBadge({ status }: { status: string }) {
  const meta = EXEC_STATUS_META[status] ?? { label: status, color: "text-muted", icon: null };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
      meta.color, "bg-surface-tertiary",
    )}>
      {meta.icon}{meta.label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return "—";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// ─── Playbook executions tab ──────────────────────────────────────────────────

interface ExecStepLog {
  stepId: string; nodeLabel: string; nodeKind: string;
  status: string; durationMs?: number; output?: string;
}

function ExecutionRow({ exec }: { exec: PlaybookExecution }) {
  const [expanded, setExpanded] = useState(false);
  let steps: ExecStepLog[] = [];
  if (exec.stepsLog) { try { steps = JSON.parse(exec.stepsLog); } catch { /* ignore */ } }

  return (
    <>
      <tr
        className={cn("hover:bg-surface-secondary transition-colors", expanded && "bg-surface-secondary")}
        onClick={() => steps.length > 0 && setExpanded(v => !v)}
        style={{ cursor: steps.length > 0 ? "pointer" : "default" }}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {steps.length > 0 ? (
              expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                       : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
            ) : <span className="w-3.5 shrink-0" />}
            <span className="text-small font-medium text-primary truncate max-w-[180px]">{exec.playbookName}</span>
          </div>
        </td>
        <td className="px-4 py-3"><StatusBadge status={exec.status} /></td>
        <td className="px-4 py-3 text-tiny text-muted capitalize">{exec.triggerType}</td>
        <td className="px-4 py-3 text-tiny text-secondary">{exec.triggeredBy}</td>
        <td className="px-4 py-3 text-tiny text-muted font-mono">{exec.alertId ?? "—"}</td>
        <td className="px-4 py-3 text-tiny text-muted whitespace-nowrap">{formatDateTime(exec.startedAt)}</td>
        <td className="px-4 py-3 text-tiny text-muted">{formatDuration(exec.startedAt, exec.endedAt)}</td>
        <td className="px-4 py-3 text-tiny text-muted">{exec.completedSteps}/{exec.totalSteps}</td>
      </tr>
      {expanded && steps.length > 0 && (
        <tr>
          <td colSpan={8} className="px-8 pb-3 bg-surface-secondary">
            <div className="rounded-lg border border-surface-border overflow-hidden">
              <table className="w-full text-tiny">
                <thead>
                  <tr className="bg-surface-tertiary text-muted uppercase tracking-wide text-[10px]">
                    <th className="px-3 py-2 text-left font-medium">Step</th>
                    <th className="px-3 py-2 text-left font-medium">Kind</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {steps.map(s => (
                    <tr key={s.stepId} className="bg-surface-secondary">
                      <td className="px-3 py-2 text-primary">{s.nodeLabel}</td>
                      <td className="px-3 py-2 text-muted capitalize">{s.nodeKind}</td>
                      <td className="px-3 py-2"><StatusBadge status={s.status?.toUpperCase() ?? "—"} /></td>
                      <td className="px-3 py-2 text-muted">{s.durationMs != null ? `${s.durationMs}ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const PAGE_SIZE = 20;

function PlaybookTab() {
  const [executions, setExecutions] = useState<PlaybookExecution[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = (p: number) => {
    setLoading(true);
    playbookService.getAudit(p, PAGE_SIZE)
      .then(({ data, total }) => { setExecutions(data); setTotal(total); setPage(p); })
      .catch(err => console.error("Failed to load audit log:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0); }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="card overflow-hidden">
      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="text-small text-muted">Loading execution history…</div>
        </div>
      ) : executions.length === 0 ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <EmptyState icon={<ClipboardList className="w-6 h-6" />} title="No executions yet"
            description="Playbook execution history will appear here" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface-secondary text-muted uppercase tracking-wide text-[10px]">
                  {["Playbook", "Status", "Trigger", "Triggered By", "Alert ID", "Started", "Duration", "Steps"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {executions.map(exec => <ExecutionRow key={exec.id} exec={exec} />)}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
              <p className="text-tiny text-muted">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button onClick={() => load(page - 1)} disabled={page === 0}
                  className="btn btn-xs btn-secondary disabled:opacity-40">Previous</button>
                <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
                  className="btn btn-xs btn-secondary disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Incident Jobs tab ────────────────────────────────────────────────────────

const JOB_STATUS_COLORS: Record<IncidentJobStatus, string> = {
  PENDING:  "text-muted bg-surface-tertiary",
  RUNNING:  "text-brand bg-brand/10",
  EXECUTED: "text-success bg-success/10",
  ERROR:    "text-critical bg-critical/10",
};

function IncidentJobsTab() {
  const [jobs, setJobs] = useState<IncidentJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = (p: number) => {
    setLoading(true);
    incidentResponseService.getJobs(p, PAGE_SIZE)
      .then(({ data, total }) => { setJobs(data); setTotal(total); setPage(p); })
      .catch(err => console.error("Failed to load incident jobs:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0); }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this incident job?")) return;
    setDeleting(id);
    try {
      await incidentResponseService.deleteJob(id);
      load(page);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="card overflow-hidden">
      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="text-small text-muted">Loading incident jobs…</div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <EmptyState icon={<Briefcase className="w-6 h-6" />} title="No incident jobs"
            description="Incident response job history will appear here" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface-secondary text-muted uppercase tracking-wide text-[10px]">
                  {["ID", "Action", "Agent", "Status", "Origin", "Created", "User", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {jobs.map(job => {
                  const statusLabel = jobStatusLabel(job.status);
                  const isExpanded = expanded === job.id;
                  const hasResult = !!job.jobResult;
                  return (
                    <>
                      <tr
                        key={job.id}
                        className={cn("hover:bg-surface-secondary transition-colors", isExpanded && "bg-surface-secondary")}
                        onClick={() => hasResult && setExpanded(isExpanded ? null : job.id)}
                        style={{ cursor: hasResult ? "pointer" : "default" }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {hasResult ? (
                              isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                            ) : <span className="w-3.5 shrink-0" />}
                            <span className="text-tiny font-mono text-muted">#{job.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-small font-medium text-primary truncate max-w-[160px] block">
                            {job.action?.actionDescription ?? job.action?.actionCommand ?? `Action #${job.actionId}`}
                          </span>
                          {job.params && (
                            <span className="text-tiny text-muted font-mono truncate block max-w-[160px]">{job.params}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-tiny text-secondary font-mono">{job.agent ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                            JOB_STATUS_COLORS[statusLabel],
                          )}>
                            {statusLabel === "RUNNING" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-tiny text-muted">
                          <span className="capitalize">{job.originType}</span>
                          <span className="text-muted/60 ml-1">#{job.originId}</span>
                        </td>
                        <td className="px-4 py-3 text-tiny text-muted whitespace-nowrap">
                          {formatDateTime(job.createdDate)}
                        </td>
                        <td className="px-4 py-3 text-tiny text-muted">{job.createdUser}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={e => handleDelete(job.id, e)}
                            disabled={deleting === job.id}
                            className="text-muted hover:text-critical transition-colors disabled:opacity-40"
                            title="Delete job"
                          >
                            {deleting === job.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasResult && (
                        <tr>
                          <td colSpan={8} className="px-8 pb-3 bg-surface-secondary">
                            <div className="rounded-lg border border-surface-border bg-surface-primary overflow-hidden">
                              <div className="px-3 py-1.5 border-b border-surface-border bg-surface-tertiary">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Job Result</span>
                              </div>
                              <pre className="px-3 py-2 text-tiny font-mono text-primary whitespace-pre-wrap break-all">
                                {job.jobResult}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
              <p className="text-tiny text-muted">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button onClick={() => load(page - 1)} disabled={page === 0}
                  className="btn btn-xs btn-secondary disabled:opacity-40">Previous</button>
                <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
                  className="btn btn-xs btn-secondary disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type AuditTab = "playbooks" | "jobs";

export default function SoarAuditPage() {
  const [tab, setTab] = useState<AuditTab>("playbooks");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">SOAR Audit</h1>
        <p className="text-secondary mt-1">Response action execution history</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-border">
        <button
          onClick={() => setTab("playbooks")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-small font-medium border-b-2 -mb-px transition-colors",
            tab === "playbooks"
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-primary",
          )}
        >
          <ClipboardList className="w-3.5 h-3.5" /> Playbook Executions
        </button>
        <button
          onClick={() => setTab("jobs")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-small font-medium border-b-2 -mb-px transition-colors",
            tab === "jobs"
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-primary",
          )}
        >
          <Briefcase className="w-3.5 h-3.5" /> Incident Jobs
        </button>
      </div>

      {tab === "playbooks" ? <PlaybookTab /> : <IncidentJobsTab />}
    </div>
  );
}
