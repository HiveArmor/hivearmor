"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileBarChart2, FileText, Download, Eye,
  Play, Plus, CheckCircle, AlertTriangle,
  RefreshCw, Calendar, Trash2,
} from "lucide-react";
import { reportService, ReportTemplate, GeneratedReport, ReportSchedule } from "@/services/report.service";
import { toast } from "@/components/ui/toast";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportScheduleModal } from "@/components/reports/report-schedule-modal";
import { ReportViewerDrawer } from "@/components/reports/report-viewer-drawer";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  security:    "var(--color-critical)",
  compliance:  "var(--brand-primary)",
  operational: "var(--color-medium)",
  executive:   "var(--color-high)",
};

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  PDF:  <FileText className="w-3.5 h-3.5 text-severity-critical" />,
  CSV:  <FileText className="w-3.5 h-3.5 text-brand" />,
  HTML: <FileText className="w-3.5 h-3.5 text-muted" />,
};

function fmtTs(ts?: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function categoryFromTemplate(t: ReportTemplate): string {
  return (t.reportCategory ?? "operational").toLowerCase();
}

// ─── Main ────────────────────────────────────────────────────────────────────
type Tab = "templates" | "generated" | "schedules";
type CatFilter = "all" | string;

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [catFilter, setCatFilter] = useState<CatFilter>("all");

  // Data
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [generated, setGenerated] = useState<GeneratedReport[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);

  // Loading
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingGenerated, setLoadingGenerated] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(true);

  // Generating (set of reportIds currently being generated)
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());

  // Modals / drawers
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [viewerReport, setViewerReport] = useState<GeneratedReport | null>(null);

  // ── Fetch functions ──────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    const data = await reportService.getTemplates();
    setTemplates(data);
    setLoadingTemplates(false);
  }, []);

  const fetchGenerated = useCallback(async () => {
    setLoadingGenerated(true);
    const data = await reportService.getGeneratedReports();
    setGenerated(data);
    setLoadingGenerated(false);
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    const data = await reportService.getSchedules();
    setSchedules(data);
    setLoadingSchedules(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { fetchGenerated(); }, [fetchGenerated]);
  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleGenerate(template: ReportTemplate) {
    setGeneratingIds(prev => new Set(prev).add(template.id));
    try {
      await reportService.generateReport({ reportName: template.reportName, standard: template.reportCategory ?? "Unknown" });
      toast("success", "Report queued", `"${template.reportName}" is being generated.`);
      // Refresh generated list so the new entry appears
      await fetchGenerated();
    } catch (err) {
      toast("error", "Generation failed", err instanceof Error ? err.message : undefined);
    } finally {
      setGeneratingIds(prev => { const s = new Set(prev); s.delete(template.id); return s; });
    }
  }

  async function handleDeleteSchedule(id: number) {
    try {
      await reportService.deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
      toast("success", "Schedule deleted");
    } catch (err) {
      toast("error", "Delete failed", err instanceof Error ? err.message : undefined);
    }
  }

  async function handleDownload(report: GeneratedReport) {
    try {
      await reportService.exportReport(report.id, report.pdfPath ?? undefined);
      toast("success", "Download started");
    } catch (err) {
      toast("error", "Download failed", err instanceof Error ? err.message : undefined);
    }
  }

  function handleRefresh() {
    fetchTemplates();
    fetchGenerated();
    fetchSchedules();
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const categories = ["all", ...Array.from(new Set(templates.map(categoryFromTemplate)))];

  const filteredTemplates = templates.filter(t =>
    catFilter === "all" ? true : categoryFromTemplate(t) === catFilter
  );

  const tabs = [
    { id: "templates"  as Tab, label: "Templates",        icon: <FileText      className="w-3.5 h-3.5" /> },
    { id: "generated"  as Tab, label: "Generated Reports", icon: <FileBarChart2 className="w-3.5 h-3.5" /> },
    { id: "schedules"  as Tab, label: "Schedules",         icon: <Calendar      className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "var(--brand-primary)18" }}>
            <FileBarChart2 className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
          </div>
          <div>
            <h1 className="text-h1 text-primary">Reports</h1>
            <p className="text-small text-muted">Generate, schedule, and download security and compliance reports</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="btn-ghost p-2" title="Refresh">
            <RefreshCw className="w-4 h-4 text-muted" />
          </button>
          <button
            onClick={() => { setScheduleModalOpen(true); }}
            className="btn-primary text-small flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> New Schedule
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-surface-border shrink-0 mt-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-small border-b-2 transition-colors",
              activeTab === t.id
                ? "border-brand text-brand font-medium"
                : "border-transparent text-muted hover:text-secondary"
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── TEMPLATES ────────────────────────────────────────────────── */}
        {activeTab === "templates" && (
          <div className="space-y-4">
            {/* Category filter */}
            {!loadingTemplates && templates.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {categories.map(c => (
                  <button
                    key={c}
                    onClick={() => setCatFilter(c)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-small transition-colors capitalize",
                      catFilter === c
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-muted hover:text-secondary hover:bg-surface-tertiary/50"
                    )}
                  >
                    {c === "all" ? "All" : c}
                  </button>
                ))}
              </div>
            )}

            {loadingTemplates ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border border-surface-border rounded-lg p-4 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-8 w-full mt-2" />
                  </div>
                ))}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-6 h-6" />}
                title="No templates found"
                description={catFilter !== "all" ? "Try a different category filter." : "No report templates are configured in the backend."}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTemplates.map(t => {
                  const cat = categoryFromTemplate(t);
                  const catColor = CAT_COLORS[cat] ?? "var(--brand-primary)";
                  const fmt = (t.repType ?? "PDF").toUpperCase();
                  const isGenerating = generatingIds.has(t.id);
                  return (
                    <div key={t.id} className="border border-surface-border rounded-lg p-4 bg-surface-secondary flex flex-col gap-3 hover:border-brand/40 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {FORMAT_ICONS[fmt] ?? FORMAT_ICONS.PDF}
                          <span className="font-medium text-primary text-small">{t.reportName}</span>
                        </div>
                        <span
                          className="text-tiny px-1.5 py-0.5 rounded font-medium shrink-0 capitalize"
                          style={{ background: `${catColor}18`, color: catColor }}
                        >
                          {cat}
                        </span>
                      </div>
                      {t.reportDescription && (
                        <p className="text-tiny text-muted flex-1">{t.reportDescription}</p>
                      )}
                      <div className="flex items-center text-tiny text-muted">
                        {t.reportFrequency && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {t.reportFrequency}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-surface-border/50">
                        <button
                          onClick={() => handleGenerate(t)}
                          disabled={isGenerating}
                          className="btn-primary text-tiny flex items-center gap-1 flex-1 justify-center disabled:opacity-60"
                        >
                          {isGenerating
                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                            : <><Play className="w-3 h-3" /> Generate Now</>
                          }
                        </button>
                        <button
                          onClick={() => setScheduleModalOpen(true)}
                          className="btn-ghost text-tiny flex items-center gap-1 px-2 py-1"
                        >
                          <Calendar className="w-3 h-3" /> Schedule
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── GENERATED REPORTS ────────────────────────────────────────── */}
        {activeTab === "generated" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-h2 text-primary">Generated Reports</h2>
              {!loadingGenerated && (
                <span className="text-tiny text-muted">{generated.length} reports</span>
              )}
            </div>

            {loadingGenerated ? (
              <div className="border border-surface-border rounded-lg overflow-hidden">
                <TableSkeleton rows={6} cols={7} />
              </div>
            ) : generated.length === 0 ? (
              <EmptyState
                icon={<FileBarChart2 className="w-6 h-6" />}
                title="No generated reports"
                description="Generate a report from the Templates tab to see it here."
                action={
                  <button onClick={() => setActiveTab("templates")} className="btn-primary text-small">
                    Go to Templates
                  </button>
                }
              />
            ) : (
              <div className="border border-surface-border rounded-lg overflow-hidden">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-secondary">
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Report</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Generated</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">By</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Status</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Standard</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {generated.map(r => {
                      const status = (r.status ?? "pending").toLowerCase();
                      const isDone = status === "completed" || status === "generated";
                      return (
                        <tr key={r.id} className="hover:bg-surface-tertiary/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-primary">{r.reportName}</td>
                          <td className="px-4 py-3 text-muted text-tiny">{fmtTs(r.createdDate)}</td>
                          <td className="px-4 py-3 text-muted text-tiny font-mono">{r.createdBy ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "flex items-center gap-1 text-tiny font-medium",
                              isDone            ? "text-brand" :
                              status === "pending" ? "text-warning" :
                              "text-severity-critical"
                            )}>
                              {isDone              ? <CheckCircle className="w-3 h-3" /> :
                               status === "pending" ? <RefreshCw   className="w-3 h-3 animate-spin" /> :
                               <AlertTriangle className="w-3 h-3" />}
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-tiny text-muted">{r.standard}</td>
                          <td className="px-4 py-3">
                            {isDone && (
                              <div className="flex items-center gap-2">
                                <button
                                  title="View"
                                  onClick={() => setViewerReport(r)}
                                  className="p-1 text-muted hover:text-secondary transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  title="Download"
                                  onClick={() => handleDownload(r)}
                                  className="p-1 text-muted hover:text-secondary transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SCHEDULES ────────────────────────────────────────────────── */}
        {activeTab === "schedules" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-h2 text-primary">Scheduled Reports</h2>
              <button
                onClick={() => { setScheduleModalOpen(true); }}
                className="btn-primary text-small flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> New Schedule
              </button>
            </div>

            {loadingSchedules ? (
              <div className="border border-surface-border rounded-lg overflow-hidden">
                <TableSkeleton rows={4} cols={5} />
              </div>
            ) : schedules.length === 0 ? (
              <EmptyState
                icon={<Calendar className="w-6 h-6" />}
                title="No scheduled reports"
                description="Create a schedule to run reports automatically on a recurring basis."
                action={
                  <button
                    onClick={() => { setScheduleModalOpen(true); }}
                    className="btn-primary text-small flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Schedule
                  </button>
                }
              />
            ) : (
              <div className="border border-surface-border rounded-lg overflow-hidden">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-secondary">
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Report</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Schedule (Cron)</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Status</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Last Run</th>
                      <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Delivery</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {schedules.map(s => (
                      <tr key={s.id} className="hover:bg-surface-tertiary/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-primary">Report #{s.complianceId}</td>
                        <td className="px-4 py-3 text-muted text-tiny font-mono">{s.scheduleString ?? "—"}</td>
                        <td className="px-4 py-3 text-muted text-tiny">—</td>
                        <td className="px-4 py-3 text-muted text-tiny">{fmtTs(s.lastExecutionTime)}</td>
                        <td className="px-4 py-3 text-tiny text-muted">—</td>
                        <td className="px-4 py-3">
                          <button
                            title="Delete schedule"
                            onClick={() => handleDeleteSchedule(s.id)}
                            className="p-1 text-muted hover:text-severity-critical transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Modals / Drawers */}
      <ReportScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onCreated={s => setSchedules(prev => [...prev, s])}
      />

      <ReportViewerDrawer
        report={viewerReport}
        onClose={() => setViewerReport(null)}
      />
    </div>
  );
}
