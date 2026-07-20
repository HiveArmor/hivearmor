"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  X, Shield, Brain, Database, Map, History, Tag, Siren,
  Maximize2, Minimize2, Copy, Check, Layers, Network,
  AlertTriangle, Users, Monitor,
} from "lucide-react";
import { UtmAlert, severityToLevel, statusToLabel, AlertStatus, EntityGraphDTO } from "@/types/alert";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { AlertStatusBadge } from "./alert-status-badge";
import { alertService } from "@/services/alert.service";
import { entityGraphService } from "@/services/entity-graph.service";
import { toast } from "@/components/ui/toast";
import { format } from "date-fns";

type TabId = "detail" | "socai" | "events" | "incident" | "map" | "history" | "tags" | "echoes" | "graph";

interface AlertDetailPanelProps {
  alert: UtmAlert;
  onClose: () => void;
  onRefresh: () => void;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className="ml-1 opacity-0 group-hover/field:opacity-100 transition-opacity text-muted hover:text-brand"
    >
      {copied ? <Check className="w-3 h-3 text-brand" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return (
    <>
      <span className="text-muted">{label}</span>
      <span className="text-muted">—</span>
    </>
  );
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className={cn("group/field flex items-center", mono ? "font-mono text-secondary" : "text-secondary")}>
        {value}
        <CopyButton value={value} />
      </span>
    </>
  );
}

export function AlertDetailPanel({ alert, onClose, onRefresh }: AlertDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("detail");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ classification?: string; confidenceScore?: number; reasoning?: string[]; nextSteps?: { action: string; details: string }[]; analyzedAt?: string; modelVersion?: string } | null>(null);
  const [triageLoaded, setTriageLoaded] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [noteText, setNoteText] = useState(alert.notes || "");
  const [editingNote, setEditingNote] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [echoAlerts, setEchoAlerts] = useState<UtmAlert[]>([]);
  const [echoesLoading, setEchoesLoading] = useState(false);
  const [echoesLoaded, setEchoesLoaded] = useState(false);
  const [graphData, setGraphData] = useState<EntityGraphDTO | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphLoaded, setGraphLoaded] = useState(false);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "detail",  label: "Detail",                            icon: <Shield className="w-3.5 h-3.5" />,   show: true },
    { id: "socai",   label: "SOC AI",                            icon: <Brain className="w-3.5 h-3.5" />,    show: true },
    { id: "events",  label: `Events (${alert.events?.length || 0})`, icon: <Database className="w-3.5 h-3.5" />, show: (alert.events?.length || 0) > 0 },
    { id: "echoes",  label: `Echoes (${alert.echoes ?? 0})`,     icon: <Layers className="w-3.5 h-3.5" />,   show: true },
    { id: "incident",label: "Incident",                          icon: <Siren className="w-3.5 h-3.5" />,    show: !!alert.isIncident },
    { id: "map",     label: "Map",                               icon: <Map className="w-3.5 h-3.5" />,      show: !!alert.target?.geolocation?.latitude },
    { id: "history", label: "History",                           icon: <History className="w-3.5 h-3.5" />,  show: true },
    { id: "tags",    label: "Tags",                              icon: <Tag className="w-3.5 h-3.5" />,      show: !!alert.tagRulesApplied?.length },
    { id: "graph",   label: "Graph",                             icon: <Network className="w-3.5 h-3.5" />,  show: !!(alert.adversary?.ip || alert.recentAlertCount) },
  ];

  useEffect(() => {
    if (activeTab === "socai" && !triageLoaded && !aiLoading && !aiResult) {
      setTriageLoaded(true);
      alertService.getTriageResult(alert.id).then((triage) => {
        if (triage && triage.status === "COMPLETED") {
          let reasoning: string[] = [];
          let nextSteps: { action: string; details: string }[] = [];
          try { reasoning = JSON.parse(triage.reasoning ?? "[]"); } catch { /* use empty */ }
          try { nextSteps = JSON.parse(triage.nextSteps ?? "[]"); } catch { /* use empty */ }
          setAiResult({
            classification: triage.classification,
            confidenceScore: triage.confidenceScore,
            reasoning,
            nextSteps,
            analyzedAt: triage.analyzedAt,
            modelVersion: triage.modelVersion,
          });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleTabChange = async (id: TabId) => {
    setActiveTab(id);
    if (id === "echoes" && !echoesLoaded) {
      setEchoesLoading(true);
      try {
        const res = await alertService.search({
          page: 0,
          size: 20,
          extraFilters: [{ field: "parentId", operator: "IS", value: alert.id }],
        });
        setEchoAlerts(res.content);
      } catch { /* ignore */ }
      finally {
        setEchoesLoading(false);
        setEchoesLoaded(true);
      }
    }
    if (id === "graph" && !graphLoaded) {
      const ip = alert.adversary?.ip;
      if (ip) {
        setGraphLoading(true);
        try {
          const data = await entityGraphService.getGraph("ip", ip);
          setGraphData(data);
        } catch { /* ignore */ }
        finally {
          setGraphLoading(false);
          setGraphLoaded(true);
        }
      } else {
        setGraphLoaded(true);
      }
    }
  };

  const handleStatusChange = async (newStatus: AlertStatus) => {
    setStatusChanging(true);
    setShowStatusMenu(false);
    try {
      await alertService.updateStatus([alert.id], newStatus);
      toast("success", "Status updated", `Alert moved to ${statusToLabel(newStatus)}`);
      onRefresh();
    } catch {
      toast("error", "Failed to update status");
    } finally {
      setStatusChanging(false);
    }
  };

  const handleFalsePositive = async () => {
    setStatusChanging(true);
    try {
      await alertService.updateStatus([alert.id], AlertStatus.COMPLETED, "false_positive", true);
      toast("success", "Marked as false positive");
      onRefresh();
      onClose();
    } catch {
      toast("error", "Failed to mark false positive");
    } finally {
      setStatusChanging(false);
    }
  };

  const handleSocAi = async () => {
    setAiLoading(true);
    try {
      const res = await alertService.analyzeSocAi(alert);
      if (!res) {
        toast("warning", "AI not available", "SOC-AI service is not configured on this server.");
      } else if (res.status === "Completed") {
        setAiResult(res);
      } else if (res.status === "queued" || res.status === "Processing") {
        toast("info", "Analysis queued", "SOC AI is processing this alert. Check back in a moment.");
        // Poll once after 4s in case it completes quickly
        setTimeout(async () => {
          const triage = await alertService.getTriageResult(alert.id);
          if (triage?.status === "COMPLETED") {
            let reasoning: string[] = [];
            let nextSteps: { action: string; details: string }[] = [];
            try { reasoning = JSON.parse(triage.reasoning ?? "[]"); } catch { /* */ }
            try { nextSteps = JSON.parse(triage.nextSteps ?? "[]"); } catch { /* */ }
            setAiResult({ classification: triage.classification, confidenceScore: triage.confidenceScore, reasoning, nextSteps, analyzedAt: triage.analyzedAt, modelVersion: triage.modelVersion });
            setAiLoading(false);
          }
        }, 4000);
        return;
      } else if (res.status === "error") {
        toast("warning", "AI not available", "SOC-AI service is not configured on this server.");
      }
    } catch {
      toast("error", "SOC AI analysis failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveNote = async () => {
    try {
      await alertService.updateNotes(alert.id, noteText);
      toast("success", "Note saved");
      setEditingNote(false);
      onRefresh();
    } catch {
      toast("error", "Failed to save note");
    }
  };

  const drawerClass = maximized
    ? "fixed inset-4 rounded-xl bg-surface-primary border border-surface-border z-50 flex flex-col animate-scale-in"
    : "fixed right-0 top-0 bottom-0 w-[700px] bg-surface-primary border-l border-surface-border z-50 flex flex-col animate-slide-in-right";

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className={drawerClass}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-h3 text-primary truncate">{alert.name}</h2>
            <p className="text-tiny text-muted mt-0.5">ID: {alert.id}</p>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <button
              onClick={() => setMaximized((m) => !m)}
              className="p-1.5 rounded hover:bg-surface-tertiary text-muted transition-colors"
              title={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-tertiary text-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-border px-4 shrink-0 overflow-x-auto">
          {tabs.filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-small border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-secondary"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "detail" && (
            <div className="space-y-4">
              {/* Description */}
              {alert.description && (
                <div className="p-3 rounded-md bg-surface-secondary">
                  <p className="text-body text-secondary">{alert.description}</p>
                </div>
              )}

              {/* Solution callout */}
              {alert.solution && (
                <div className="p-3 rounded-md bg-warning/5 border-l-[3px] border-warning">
                  <p className="text-tiny font-semibold text-warning mb-1 uppercase tracking-wider">Recommended Solution</p>
                  <p className="text-small text-secondary">{alert.solution}</p>
                </div>
              )}

              {/* Severity & Status */}
              <div className="flex items-center gap-3">
                <SeverityBadge severity={severityToLevel(alert.severity)} />
                <div className="relative">
                  <AlertStatusBadge status={alert.status} onClick={() => setShowStatusMenu(!showStatusMenu)} />
                  {showStatusMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                      <div className="absolute left-0 top-full mt-1 w-40 card shadow-dropdown py-1 z-20">
                        {[AlertStatus.OPEN, AlertStatus.IN_REVIEW, AlertStatus.COMPLETED].filter(s => s !== alert.status).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(s)}
                            className="w-full text-left px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary transition-colors"
                          >
                            {statusToLabel(s)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {statusChanging && <span className="text-tiny text-muted animate-pulse">Updating...</span>}
              </div>

              {/* Fields grid */}
              <div className="border border-surface-border rounded-lg p-4 space-y-3">
                <h4 className="text-h4 text-primary">Details</h4>
                <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3 text-small">
                  <FieldRow label="Rule"        value={alert.name}       />
                  <FieldRow label="Category"    value={alert.category}   />
                  <FieldRow label="Data Source" value={alert.dataSource} mono />
                  <FieldRow label="Data Type"   value={alert.dataType}   />
                  <FieldRow label="Technique"   value={alert.technique}  />
                  <FieldRow label="Protocol"    value={alert.protocol}   />
                  <span className="text-muted">Date</span>
                  <span className="text-secondary">
                    {alert.timestamp ? format(new Date(alert.timestamp), "PPpp") : "—"}
                  </span>
                  <span className="text-muted">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {alert.tags?.length ? alert.tags.map(t => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-surface-tertiary text-tiny text-secondary">{t}</span>
                    )) : <span className="text-muted">None</span>}
                  </div>
                </div>
              </div>

              {/* Note */}
              <div className="border border-surface-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-h4 text-primary">Comment</h4>
                  {!editingNote && (
                    <button onClick={() => setEditingNote(true)} className="text-tiny text-brand hover:underline">Edit</button>
                  )}
                </div>
                {editingNote ? (
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="input-base w-full h-20 resize-none text-small"
                      maxLength={512}
                      placeholder="Add a comment..."
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-tiny text-muted">{512 - noteText.length} chars remaining</span>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingNote(false)} className="btn-ghost text-small py-1 px-2">Cancel</button>
                        <button onClick={handleSaveNote} className="btn-primary text-small py-1 px-2">Save</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-small text-secondary">{noteText || "No comment"}</p>
                )}
              </div>

              {/* Target & Adversary */}
              <div className="grid grid-cols-2 gap-3">
                {alert.target && (
                  <div className="border border-surface-border rounded-lg p-3">
                    <h4 className="text-h4 text-primary mb-2">Target</h4>
                    <div className="space-y-1 text-small">
                      {alert.target.ip && (
                        <div className="group/field flex items-center gap-1">
                          <span className="text-muted">IP:</span>
                          <span className="text-secondary font-mono">{alert.target.ip}</span>
                          <CopyButton value={alert.target.ip} />
                        </div>
                      )}
                      {alert.target.host && (
                        <div className="group/field flex items-center gap-1">
                          <span className="text-muted">Host:</span>
                          <span className="text-secondary">{alert.target.host}</span>
                          <CopyButton value={alert.target.host} />
                        </div>
                      )}
                      {alert.target.user && (
                        <div className="group/field flex items-center gap-1">
                          <span className="text-muted">User:</span>
                          <span className="text-secondary">{alert.target.user}</span>
                          <CopyButton value={alert.target.user} />
                        </div>
                      )}
                      {alert.target.geolocation?.country && (
                        <div><span className="text-muted">Country:</span> <span className="text-secondary">{alert.target.geolocation.country}</span></div>
                      )}
                    </div>
                  </div>
                )}
                {alert.adversary && (
                  <div className="border border-severity-critical/30 rounded-lg p-3">
                    <h4 className="text-h4 text-severity-critical mb-2">Adversary</h4>
                    <div className="space-y-1 text-small">
                      {alert.adversary.ip && (
                        <div className="group/field flex items-center gap-1">
                          <span className="text-muted">IP:</span>
                          <span className="text-secondary font-mono">{alert.adversary.ip}</span>
                          <CopyButton value={alert.adversary.ip} />
                        </div>
                      )}
                      {alert.adversary.host && (
                        <div className="group/field flex items-center gap-1">
                          <span className="text-muted">Host:</span>
                          <span className="text-secondary">{alert.adversary.host}</span>
                          <CopyButton value={alert.adversary.host} />
                        </div>
                      )}
                      {alert.adversary.user && (
                        <div className="group/field flex items-center gap-1">
                          <span className="text-muted">User:</span>
                          <span className="text-secondary">{alert.adversary.user}</span>
                          <CopyButton value={alert.adversary.user} />
                        </div>
                      )}
                      {alert.adversary.geolocation?.country && (
                        <div><span className="text-muted">Country:</span> <span className="text-secondary">{alert.adversary.geolocation.country}</span></div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* References */}
              {alert.reference && alert.reference.length > 0 && (
                <div className="border border-surface-border rounded-lg p-4">
                  <h4 className="text-h4 text-primary mb-2">References</h4>
                  <div className="space-y-1">
                    {alert.reference.map((ref, i) => (
                      <a key={i} href={ref} target="_blank" rel="noopener noreferrer"
                        className="block text-small text-brand hover:underline truncate">{ref}</a>
                    ))}
                  </div>
                </div>
              )}

              {/* Impact */}
              {alert.impact && (
                <div className="border border-surface-border rounded-lg p-4">
                  <h4 className="text-h4 text-primary mb-2">Impact</h4>
                  <div className="flex gap-4">
                    {["confidentiality", "integrity", "availability"].map(key => {
                      const val = (alert.impact as Record<string, number>)?.[key] || 0;
                      return (
                        <div key={key} className="text-center">
                          <div className={cn("text-h2 font-bold", val >= 3 ? "text-severity-critical" : val >= 2 ? "text-severity-medium" : "text-severity-low")}>
                            {val}
                          </div>
                          <div className="text-tiny text-muted capitalize">{key}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "socai" && (
            <div className="space-y-4">
              {!aiResult && !aiLoading && (
                <div className="text-center py-8">
                  <Brain className="w-10 h-10 text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-body text-secondary mb-4">Analyze this alert with SOC AI for automated classification and recommended next steps.</p>
                  <button onClick={handleSocAi} className="btn-primary flex items-center gap-2 mx-auto">
                    <Brain className="w-4 h-4" /> Analyze with SOC AI
                  </button>
                </div>
              )}
              {aiLoading && (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-body text-secondary">Analyzing alert...</p>
                </div>
              )}
              {aiResult && (
                <div className="space-y-4">
                  <div className="px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-small text-yellow-300">
                    <strong>Warning:</strong> AI analysis is in beta. Use this information carefully.
                  </div>
                  {/* Classification + Confidence */}
                  <div className="flex items-center flex-wrap gap-3">
                    <div>
                      <span className="text-small text-muted">Classification:</span>
                      <span className="ml-2 px-2 py-0.5 rounded bg-brand/15 text-brand text-small font-medium">{aiResult.classification ?? "Unknown"}</span>
                    </div>
                    {aiResult.confidenceScore !== undefined && (
                      <div>
                        <span className="text-small text-muted">Confidence:</span>
                        <span className={cn(
                          "ml-2 px-2 py-0.5 rounded text-small font-medium",
                          aiResult.confidenceScore >= 80 ? "bg-brand/15 text-brand" :
                          aiResult.confidenceScore >= 50 ? "bg-warning/15 text-warning" :
                          "bg-surface-tertiary text-muted"
                        )}>
                          {aiResult.confidenceScore.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Meta: analyzed at + model */}
                  {(aiResult.analyzedAt || aiResult.modelVersion) && (
                    <div className="flex items-center gap-3 text-tiny text-muted">
                      {aiResult.analyzedAt && (
                        <span>Analyzed {format(new Date(aiResult.analyzedAt), "MMM d, HH:mm")}</span>
                      )}
                      {aiResult.modelVersion && (
                        <span className="font-mono">{aiResult.modelVersion}</span>
                      )}
                    </div>
                  )}
                  {aiResult.reasoning && aiResult.reasoning.length > 0 && (
                    <div>
                      <h4 className="text-h4 text-primary mb-2">Reasoning</h4>
                      <ul className="space-y-1.5">
                        {aiResult.reasoning.map((r, i) => (
                          <li key={i} className="flex gap-2 text-small text-secondary">
                            <span className="text-muted mt-1">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiResult.nextSteps && aiResult.nextSteps.length > 0 && (
                    <div>
                      <h4 className="text-h4 text-primary mb-2">Next Steps</h4>
                      <div className="space-y-2">
                        {aiResult.nextSteps.map((step, i) => (
                          <div key={i} className="border border-surface-border rounded-md p-3">
                            <p className="text-small text-primary font-medium">{step.action}</p>
                            <p className="text-small text-secondary mt-1">{step.details}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={handleSocAi} disabled={aiLoading} className="btn-secondary text-small flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5" /> Re-analyze
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "events" && (
            <div className="space-y-2">
              <h4 className="text-h4 text-primary">Related Events ({alert.events?.length || 0})</h4>
              {alert.events?.map((event, i) => (
                <div key={i} className="border border-surface-border rounded-md p-3 font-mono text-tiny text-secondary overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify(event, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}

          {activeTab === "echoes" && (
            <div className="space-y-3">
              <h4 className="text-h4 text-primary">Echo Alerts</h4>
              {echoesLoading && (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-small text-muted">Loading echoes...</p>
                </div>
              )}
              {!echoesLoading && echoesLoaded && echoAlerts.length === 0 && (
                <div className="text-center py-8">
                  <Layers className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
                  <p className="text-small text-muted">No echo alerts found for this alert.</p>
                </div>
              )}
              {!echoesLoading && echoAlerts.map((echo) => (
                <div key={echo.id} className="border border-surface-border rounded-md p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-small font-medium text-primary">{echo.name}</span>
                    <span className="text-tiny text-muted ml-auto">
                      {echo.timestamp ? format(new Date(echo.timestamp), "MMM d, HH:mm") : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-tiny text-muted">
                    <span>{echo.dataSource}</span>
                    {echo.target?.ip && <span className="font-mono">{echo.target.ip}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "incident" && alert.incidentDetail && (
            <div className="space-y-3">
              <h4 className="text-h4 text-primary">Incident Information</h4>
              <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3 text-small border border-surface-border rounded-lg p-4">
                <span className="text-muted">Name</span>
                <span className="text-primary">{alert.incidentDetail.incidentName}</span>
                <span className="text-muted">Created by</span>
                <span className="text-secondary">{alert.incidentDetail.createdBy}</span>
                <span className="text-muted">Created</span>
                <span className="text-secondary">{alert.incidentDetail.creationDate}</span>
                <span className="text-muted">Source</span>
                <span className="text-secondary">{alert.incidentDetail.incidentSource}</span>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="text-center py-8">
              <History className="w-8 h-8 text-muted mx-auto mb-3 opacity-50" />
              <p className="text-body text-secondary">Alert change history will appear here.</p>
            </div>
          )}

          {activeTab === "tags" && (
            <div className="space-y-3">
              <h4 className="text-h4 text-primary">Applied Tag Rules</h4>
              {alert.tagRulesApplied?.map(ruleId => (
                <div key={ruleId} className="px-3 py-2 border border-surface-border rounded-md text-small text-secondary">
                  Rule ID: {ruleId}
                </div>
              ))}
            </div>
          )}

          {activeTab === "graph" && (
            <div className="space-y-4">
              {/* Inline graph context from enriched alert fields */}
              {(alert.sourceIpRiskScore !== undefined || alert.sourceIpMalicious || alert.recentAlertCount) && (
                <div className="border border-surface-border rounded-lg p-4 space-y-3">
                  <h4 className="text-h4 text-primary">Entity Risk Context</h4>
                  <div className="flex flex-wrap gap-2 items-center">
                    {alert.sourceIpRiskScore !== undefined && alert.sourceIpRiskScore > 0 && (
                      <span className={cn(
                        "px-2 py-1 rounded text-small font-semibold",
                        alert.sourceIpRiskScore >= 8 ? "bg-severity-critical/15 text-severity-critical" :
                        alert.sourceIpRiskScore >= 5 ? "bg-severity-high/15 text-severity-high" :
                        "bg-severity-medium/15 text-severity-medium"
                      )}>
                        Risk Score: {alert.sourceIpRiskScore.toFixed(1)}
                      </span>
                    )}
                    {alert.sourceIpMalicious && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-severity-critical/15 text-severity-critical text-small font-semibold">
                        <AlertTriangle className="w-3 h-3" /> Known Malicious IP
                      </span>
                    )}
                    {alert.sourceIpCountry && (
                      <span className="px-2 py-1 rounded bg-surface-tertiary text-secondary text-small">
                        {alert.sourceIpCountry}
                      </span>
                    )}
                  </div>
                  {(alert.recentAlertCount ?? 0) > 1 && (
                    <p className="text-small text-warning flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      This IP generated <strong>{alert.recentAlertCount}</strong> alerts in the last 30 days
                    </p>
                  )}
                  {(alert.relatedUsers?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 text-small">
                      <Users className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                      <div>
                        <span className="text-muted">Related users: </span>
                        <span className="text-secondary">{alert.relatedUsers!.join(", ")}</span>
                      </div>
                    </div>
                  )}
                  {(alert.relatedHosts?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 text-small">
                      <Monitor className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                      <div>
                        <span className="text-muted">Related hosts: </span>
                        <span className="text-secondary">{alert.relatedHosts!.join(", ")}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Live graph neighborhood from entity graph API */}
              {graphLoading && (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-small text-muted">Loading entity graph...</p>
                </div>
              )}
              {!graphLoading && graphLoaded && graphData && graphData.nodes.length > 1 && (
                <div className="border border-surface-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-h4 text-primary">Entity Neighborhood</h4>
                    <span className="text-tiny text-muted">{graphData.alertCount} alerts (30d)</span>
                  </div>
                  <div className="space-y-1.5">
                    {graphData.edges.map((edge, i) => {
                      const target = graphData.nodes.find(n => n.id === edge.target);
                      if (!target) return null;
                      const relationLabel = edge.relation.replace(/_/g, " ");
                      return (
                        <div key={i} className="flex items-center gap-2 text-small px-2 py-1.5 rounded bg-surface-secondary">
                          <span className="text-muted w-28 shrink-0 truncate capitalize">{relationLabel}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-tiny font-medium",
                            target.type === "ip"   ? "bg-info/15 text-info" :
                            target.type === "user" ? "bg-brand/15 text-brand" :
                            "bg-surface-tertiary text-secondary"
                          )}>
                            {target.type}
                          </span>
                          <span className="text-secondary font-mono text-tiny truncate">{target.label}</span>
                          {typeof target.properties?.alertCount === "number" && (
                            <span className="ml-auto text-tiny text-muted shrink-0">{target.properties.alertCount as number} alerts</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!graphLoading && graphLoaded && (!graphData || graphData.nodes.length <= 1) && !alert.sourceIpRiskScore && !alert.recentAlertCount && (
                <div className="text-center py-8">
                  <Network className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
                  <p className="text-small text-muted">No graph context available for this alert yet.</p>
                  <p className="text-tiny text-muted mt-1">Context builds up as more alerts are processed.</p>
                </div>
              )}
              {!graphLoaded && !graphLoading && !alert.adversary?.ip && (
                <div className="text-center py-8">
                  <Network className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
                  <p className="text-small text-muted">No adversary IP available for graph lookup.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 py-3 border-t border-surface-border shrink-0 space-y-2">
          {/* AI Analysis quick-action */}
          <button
            onClick={() => { handleTabChange("socai"); if (!aiResult && !aiLoading) handleSocAi(); }}
            disabled={aiLoading}
            className="w-full btn-secondary text-small flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Brain className="w-3.5 h-3.5 text-brand" />
            {aiLoading ? "Analyzing…" : aiResult ? "View AI Analysis" : "AI Analysis"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusChange(AlertStatus.IN_REVIEW)}
              disabled={statusChanging}
              className="btn-secondary flex-1 text-small disabled:opacity-50"
            >
              In Review
            </button>
            <button
              onClick={() => handleStatusChange(AlertStatus.COMPLETED)}
              disabled={statusChanging}
              className="btn-primary flex-1 text-small disabled:opacity-50"
            >
              Complete
            </button>
            <button
              onClick={handleFalsePositive}
              disabled={statusChanging}
              className="btn-ghost flex-1 text-small text-warning hover:bg-warning/10 disabled:opacity-50"
              title="Mark as false positive and complete"
            >
              False Positive
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
