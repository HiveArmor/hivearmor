"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Calendar, Download, Trash2, Eye, FileText, Shield,
  Clock, CheckCircle, XCircle, Loader2, BarChart3, Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { format } from "date-fns";

import { CompliancePostureKPI } from "@/components/compliance/compliance-posture-kpi";
import { ComplianceFrameworkHeatmap } from "@/components/compliance/compliance-framework-heatmap";
import { ComplianceTrendChart } from "@/components/compliance/compliance-trend-chart";
import { ComplianceControlDrawer } from "@/components/compliance/compliance-control-drawer";
import type { ControlDomain, FrameworkData } from "@/components/compliance/compliance-framework-heatmap";

import {
  complianceService,
  normalizeStatus,
  type ComplianceStandard,
  type ComplianceSection,
  type ComplianceControlLatestEvaluation,
} from "@/services/compliance.service";
import type { FrameworkTrendSeries } from "@/components/compliance/compliance-trend-chart";

// ── Types ─────────────────────────────────────────────────────────────────────

type MainTab = "posture" | "reports" | "schedule";

interface ComplianceReport {
  id: number;
  reportName: string;
  standard: string;
  status: string;
  createdDate: string;
  createdBy?: string;
}

interface ScheduledReport {
  id: number;
  name: string;
  frequency: string;
  nextRun?: string;
  status: string;
}

// ── Framework data builder ────────────────────────────────────────────────────

// Derive FrameworkData (used by heatmap) from sections + latest evaluations.
// Each section becomes a "domain"; controls are loaded per-section.
async function buildFrameworkData(
  standard: ComplianceStandard,
  sections: ComplianceSection[]
): Promise<FrameworkData> {
  // Load controls for all sections in parallel (best-effort — failures yield empty)
  const sectionResults = await Promise.allSettled(
    sections.map((sec) => complianceService.getControlsWithLatestEval(sec.id, 0, 200))
  );

  let totalPassing = 0;

  let totalControls = 0;
  let latestEvalTs: string | undefined;

  const domains: ControlDomain[] = sections.map((sec, i) => {
    const controls: ComplianceControlLatestEvaluation[] =
      sectionResults[i].status === "fulfilled" ? sectionResults[i].value : [];

    let passing = 0, failing = 0, partial = 0;
    for (const ctrl of controls) {
      const s = normalizeStatus(ctrl.lastEvaluationStatus);
      if (s === "PASS") passing++;
      else if (s === "FAIL") failing++;
      else if (s === "PARTIAL") partial++;
      // Track newest evaluation timestamp across all controls
      if (ctrl.lastEvaluationTimestamp) {
        if (!latestEvalTs || ctrl.lastEvaluationTimestamp > latestEvalTs) {
          latestEvalTs = ctrl.lastEvaluationTimestamp;
        }
      }
    }
    const total = controls.length;
    const passRate = total > 0 ? Math.round((passing / total) * 100) : 0;

    totalPassing += passing;

    totalControls += total;

    return {
      id: String(sec.id),
      code: String(sec.id),
      name: sec.standardSectionName,
      passRate,
      totalControls: total,
      passing,
      failing,
      partial,
    };
  });

  const overallScore =
    totalControls > 0 ? Math.round((totalPassing / totalControls) * 100) : 0;

  return {
    id: String(standard.id),
    backendId: standard.id,
    name: standard.standardName,
    shortName: abbreviate(standard.standardName),
    overallScore,
    domains,
    lastEvaluated: latestEvalTs,
  };
}

function abbreviate(name: string): string {
  // Use first letters of each word, max 6 chars
  const words = name.split(/\s+/);
  if (words.length === 1) return name.slice(0, 6).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; className: string }> = {
    Generated: { icon: <CheckCircle className="w-3 h-3" />, className: "bg-green-500/10 text-green-400" },
    Pending:   { icon: <Loader2 className="w-3 h-3 animate-spin" />, className: "bg-yellow-500/10 text-yellow-400" },
    Failed:    { icon: <XCircle className="w-3 h-3" />, className: "bg-red-500/10 text-red-400" },
    Active:    { icon: <CheckCircle className="w-3 h-3" />, className: "bg-green-500/10 text-green-400" },
    Paused:    { icon: <Clock className="w-3 h-3" />, className: "bg-gray-500/10 text-gray-400" },
  };
  const c = config[status] ?? config["Pending"];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium", c.className)}>
      {c.icon} {status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [tab, setTab] = useState<MainTab>("posture");
  const [reportsTab, setReportsTab] = useState<"list" | "templates">("list");
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(false);

  // Drawer state
  const [drawerDomain, setDrawerDomain] = useState<ControlDomain | null>(null);
  const [drawerFramework, setDrawerFramework] = useState<FrameworkData | null>(null);

  // Framework / posture state
  const [standards, setStandards] = useState<ComplianceStandard[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkData[]>([]);
  const [frameworksLoading, setFrameworksLoading] = useState(true);
  const [activeFrameworkId, setActiveFrameworkId] = useState<string>("");
  const [domainsLoading, setDomainsLoading] = useState(false);

  // Per-framework evaluation trigger state
  const [triggeringId, setTriggeringId] = useState<number | null>(null);

  // Cache of fully-loaded FrameworkData (avoids re-fetching on tab switch)
  const frameworkCache = useRef<Map<number, FrameworkData>>(new Map());

  // ── Load framework shells (standards list) ────────────────────────────────

  useEffect(() => {
    setFrameworksLoading(true);
    complianceService
      .getStandards()
      .then((stds) => {
        setStandards(stds);
        // Build placeholder FrameworkData entries so tabs are visible immediately
        const placeholders: FrameworkData[] = stds.map((s) => ({
          id: String(s.id),
          backendId: s.id,
          name: s.standardName,
          shortName: abbreviate(s.standardName),
          overallScore: 0,
          domains: [],
        }));
        setFrameworks(placeholders);
        if (placeholders.length > 0) {
          setActiveFrameworkId(placeholders[0].id);
        }
      })
      .catch(() => {
        // Backend unavailable — frameworks will remain empty, showing empty state
      })
      .finally(() => setFrameworksLoading(false));
  }, []);

  // ── Load sections + controls for active framework ─────────────────────────

  useEffect(() => {
    if (!activeFrameworkId) return;
    const backendId = Number(activeFrameworkId);
    if (isNaN(backendId)) return;

    // Use cache if available
    if (frameworkCache.current.has(backendId)) {
      const cached = frameworkCache.current.get(backendId)!;
      setFrameworks((prev) => prev.map((f) => (f.backendId === backendId ? cached : f)));
      return;
    }

    const std = standards.find((s) => s.id === backendId);
    if (!std) return;

    setDomainsLoading(true);
    complianceService
      .getSections(backendId)
      .then((sections) => buildFrameworkData(std, sections))
      .then((fw) => {
        frameworkCache.current.set(backendId, fw);
        setFrameworks((prev) => prev.map((f) => (f.backendId === backendId ? fw : f)));
      })
      .catch(() => {
        // Keep placeholder
      })
      .finally(() => setDomainsLoading(false));
  }, [activeFrameworkId, standards]);

  // ── Load reports / schedule data ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, scheduledRes] = await Promise.allSettled([
        api.get<ComplianceReport[]>("/api/ha-compliance-report-config?page=0&size=50"),
        api.get<ScheduledReport[]>("/api/ha-compliance-schedule?page=0&size=50"),
      ]);
      if (reportsRes.status === "fulfilled") setReports(reportsRes.value ?? []);
      if (scheduledRes.status === "fulfilled") setScheduled(scheduledRes.value ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "reports" || tab === "schedule") loadData();
  }, [tab, loadData]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleGenerateReport = async (standardName: string) => {
    try {
      await api.post("/api/ha-compliance-report-config", {
        reportName: `${standardName} Report - ${format(new Date(), "yyyy-MM-dd")}`,
        standard: standardName,
        status: "Pending",
      });
      toast("success", "Report generation started", `Generating ${standardName} compliance report`);
      loadData();
    } catch {
      toast("error", "Failed to generate report");
    }
  };

  const handleTriggerEvaluation = async (standard: ComplianceStandard) => {
    setTriggeringId(standard.id);
    try {
      // Re-evaluate by re-fetching all section controls (triggers backend re-evaluation via latest eval endpoint)
      const sections = await complianceService.getSections(standard.id);
      const fw = await buildFrameworkData(standard, sections);
      frameworkCache.current.set(standard.id, fw);
      setFrameworks((prev) => prev.map((f) => (f.backendId === standard.id ? fw : f)));
      toast("success", "Evaluation complete", `${standard.standardName} posture refreshed`);
    } catch {
      toast("error", "Evaluation failed", "Could not refresh compliance posture");
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDownloadReport = async (id: number, reportName: string) => {
    try {
      const token = api.getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/ha-compliance-report-config/${id}/export`, { headers });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportName.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast("error", "Failed to download report");
    }
  };

  const handleDeleteReport = async (id: number) => {
    try {
      await api.delete(`/api/ha-compliance-report-config/${id}`);
      toast("success", "Report deleted");
      loadData();
    } catch {
      toast("error", "Failed to delete report");
    }
  };

  const handleDomainClick = (domain: ControlDomain, fw: FrameworkData) => {
    setDrawerDomain(domain);
    setDrawerFramework(fw);
  };

  // ── Trend series derived from loaded frameworks ───────────────────────────

  const FRAMEWORK_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#ef4444"];

  const trendSeries: FrameworkTrendSeries[] = frameworks
    .filter((f) => f.domains.length > 0)
    .map((f, i) => ({
      id: f.id,
      name: f.shortName,
      color: FRAMEWORK_COLORS[i % FRAMEWORK_COLORS.length],
      data: [f.overallScore],
    }));

  // ── KPI data derived from loaded frameworks ───────────────────────────────

  const kpiData = (() => {
    const loaded = frameworks.filter((f) => f.domains.length > 0);
    if (loaded.length === 0) return undefined;
    let totalControls = 0, passing = 0, failing = 0, partial = 0;
    for (const fw of loaded) {
      for (const d of fw.domains) {
        totalControls += d.totalControls;
        passing += d.passing;
        failing += d.failing;
        partial += d.partial;
      }
    }
    const overallScore =
      totalControls > 0 ? Math.round((passing / totalControls) * 100) : 0;
    return {
      overallScore,
      scoreDelta: 0,
      passingControls: passing,
      passingDelta: 0,
      failingControls: failing,
      failingDelta: 0,
      overdueReviews: partial,
      overdueDelta: 0,
      totalControls,
    };
  })();

  const mainTabs: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: "posture",  label: "Posture Dashboard", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: "reports",  label: "Reports",            icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "schedule", label: "Schedule",            icon: <Calendar className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - var(--spacing-shell-top, 80px))" }}>
      {/* ── Page header ──────────────────────────────────── */}
      <div className="flex items-start justify-between px-1 pb-4">
        <div>
          <h1 className="text-h1">Compliance</h1>
          <p className="text-secondary text-small mt-0.5">Security posture and compliance reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary" onClick={() => setTab("schedule")}>
            <Calendar className="w-4 h-4" /> Schedule
          </button>
          <button className="btn btn-primary" onClick={() => { setTab("reports"); setReportsTab("templates"); }}>
            <Plus className="w-4 h-4" /> New Report
          </button>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-surface-border mb-4">
        {mainTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-small font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "text-brand border-brand"
                : "text-muted border-transparent hover:text-secondary"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Posture Dashboard ─────────────────────────────── */}
      {tab === "posture" && (
        <div className="space-y-4 flex-1">
          {frameworksLoading ? (
            <div className="card p-6 flex items-center justify-center gap-2 text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-small">Loading compliance frameworks…</span>
            </div>
          ) : (
            <>
              <CompliancePostureKPI data={kpiData} />
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <ComplianceFrameworkHeatmap
                    frameworks={frameworks.length > 0 ? frameworks : undefined}
                    activeId={activeFrameworkId}
                    onFrameworkChange={setActiveFrameworkId}
                    onDomainClick={handleDomainClick}
                    loadingDomains={domainsLoading}
                  />
                </div>
                <div>
                  <ComplianceTrendChart series={trendSeries.length > 0 ? trendSeries : undefined} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Reports tab ──────────────────────────────────── */}
      {tab === "reports" && (
        <div className="space-y-4 flex-1">
          {/* Sub-tabs */}
          <div className="flex items-center gap-1">
            {(["list", "templates"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setReportsTab(st)}
                className={cn(
                  "px-3 py-1.5 text-small rounded-lg transition-colors capitalize",
                  reportsTab === st
                    ? "bg-surface-tertiary text-primary"
                    : "text-muted hover:text-secondary"
                )}
              >
                {st === "list" ? "Generated Reports" : "Templates"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="card"><TableSkeleton rows={5} cols={6} /></div>
          ) : reportsTab === "list" ? (
            <div className="card overflow-hidden">
              {reports.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-6 h-6" />}
                  title="No reports generated"
                  description="Generate your first compliance report from the Templates tab"
                  action={
                    <button onClick={() => setReportsTab("templates")} className="btn btn-primary">
                      View Templates
                    </button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-border">
                        {["Report Name", "Standard", "Status", "Created Date", "Created By", "Actions"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.id} className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors">
                          <td className="px-4 py-3 text-body text-primary">{report.reportName}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-tiny font-medium bg-surface-tertiary text-secondary">
                              {report.standard}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={report.status} /></td>
                          <td className="px-4 py-3 text-small text-muted">
                            {report.createdDate ? format(new Date(report.createdDate), "MMM dd, yyyy") : "—"}
                          </td>
                          <td className="px-4 py-3 text-small text-secondary">{report.createdBy || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDownloadReport(report.id, report.reportName)} className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors" title="Download PDF"><Download className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDeleteReport(report.id)} className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* Templates — use real standards if loaded, else show loading */
            frameworksLoading ? (
              <div className="card p-6 flex items-center justify-center gap-2 text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-small">Loading frameworks…</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {standards.map((std) => (
                  <div key={std.id} className="card p-5 flex flex-col">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-surface-tertiary">
                        <Shield className="w-5 h-5 text-brand" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-h4 text-primary">{std.standardName}</h4>
                        <p className="text-tiny text-muted mt-0.5">
                          {frameworks.find((f) => f.backendId === std.id)?.domains.reduce((acc, d) => acc + d.totalControls, 0) ?? "—"} controls
                        </p>
                      </div>
                    </div>
                    <p className="text-small text-secondary flex-1 mb-4 line-clamp-3">{std.standardDescription || "—"}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerateReport(std.standardName)}
                        className="btn btn-secondary flex-1 justify-center"
                      >
                        <FileText className="w-3.5 h-3.5" /> Generate Report
                      </button>
                      <button
                        onClick={() => handleTriggerEvaluation(std)}
                        disabled={triggeringId === std.id}
                        title="Re-evaluate compliance posture"
                        className="btn btn-secondary px-3"
                      >
                        {triggeringId === std.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ── Schedule tab ─────────────────────────────────── */}
      {tab === "schedule" && (
        <div className="flex-1">
          {loading ? (
            <div className="card"><TableSkeleton rows={5} cols={5} /></div>
          ) : (
            <div className="card overflow-hidden">
              {scheduled.length === 0 ? (
                <EmptyState
                  icon={<Calendar className="w-6 h-6" />}
                  title="No scheduled reports"
                  description="Schedule automatic compliance report generation on a recurring basis"
                  action={
                    <button className="btn btn-primary">
                      <Plus className="w-4 h-4" /> Schedule Report
                    </button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-border">
                        {["Name", "Frequency", "Next Run", "Status", "Actions"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scheduled.map((item) => (
                        <tr key={item.id} className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors">
                          <td className="px-4 py-3 text-body text-primary">{item.name}</td>
                          <td className="px-4 py-3 text-small text-secondary">{item.frequency}</td>
                          <td className="px-4 py-3 text-small text-muted">
                            {item.nextRun ? format(new Date(item.nextRun), "MMM dd, yyyy HH:mm") : "—"}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                              <button className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Control drawer ────────────────────────────────── */}
      {drawerDomain && (
        <ComplianceControlDrawer
          domain={drawerDomain}
          framework={drawerFramework}
          onClose={() => { setDrawerDomain(null); setDrawerFramework(null); }}
        />
      )}
    </div>
  );
}
