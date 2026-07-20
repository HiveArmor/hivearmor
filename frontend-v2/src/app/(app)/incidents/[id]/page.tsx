"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Network, GitBranch, Layout } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  InvestigationHeader,
  type InvestigationIncident,
  type IncidentStatus as IStatus,
} from "@/components/investigation/investigation-header";
import {
  InvestigationEvidenceBoard,
  DEMO_EVIDENCE,
} from "@/components/investigation/investigation-evidence-board";
import {
  InvestigationTimeline,
  DEMO_TIMELINE,
} from "@/components/investigation/investigation-timeline";
import {
  InvestigationEntityGraph,
  type EntityGraph,
} from "@/components/investigation/investigation-entity-graph";
import { AlertSoarLauncher } from "@/components/alerts/alert-soar-launcher";
import { Brain, X as XIcon } from "lucide-react";
import { IncidentDetailSkeleton } from "./incident-detail-skeleton";
import { incidentService, type Incident } from "@/services/incident.service";
import { buildAlertPivotUrl } from "@/lib/alert-pivot";
import { AssigneeSelector } from "@/components/incidents/assignee-selector";
import { toast } from "@/components/ui/toast";

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = "evidence" | "timeline" | "graph";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "evidence", label: "Evidence Board", icon: <Layout className="w-3.5 h-3.5" /> },
  { id: "timeline", label: "Attack Timeline", icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: "graph",    label: "Entity Graph",    icon: <Network className="w-3.5 h-3.5" /> },
];

// ── Page ──────────────────────────────────────────────────────────────────────

function mapStatus(s: string): IStatus {
  if (s === "OPEN")      return "open";
  if (s === "IN_REVIEW" || s === "IN_PROGRESS") return "in_progress";
  if (s === "COMPLETED") return "resolved";
  return "resolved";
}

function mapToInvestigationIncident(
  data: NonNullable<Awaited<ReturnType<typeof incidentService.getById>>>,
  alertCount: number,
): InvestigationIncident {
  const sev = data.incidentSeverity >= 4 ? "critical"
    : data.incidentSeverity >= 3 ? "high"
    : data.incidentSeverity >= 2 ? "medium" : "low";
  return {
    id: String(data.id),
    name: data.incidentName,
    severity: sev,
    status: mapStatus(data.incidentStatus),
    assignee: data.incidentAssignedTo,
    alertCount,
    createdAt: data.incidentCreatedDate ? new Date(data.incidentCreatedDate).getTime() : Date.now(),
    updatedAt: Date.now(),
    tags: [],
    mitreTactics: [],
  };
}

export default function InvestigationPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [incident, setIncident] = useState<InvestigationIncident | null>(null);
  const [rawIncident, setRawIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("evidence");
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showSoar, setShowSoar] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [entityGraph, setEntityGraph] = useState<EntityGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const numId = Number(id);
    Promise.all([
      incidentService.getById(numId),
      fetch(`/api/ha-incident-alerts?incidentId.equals=${numId}&size=1`, {
        headers: { Authorization: `Bearer ${(typeof window !== "undefined" ? localStorage.getItem("hivearmor_auth_token") : null) ?? ""}` },
      }).then(r => ({ count: Number(r.headers.get("X-Total-Count") ?? "0") })).catch(() => ({ count: 0 })),
    ]).then(([data, { count }]) => {
      if (cancelled) return;
      if (!data) {
        setError("Incident not found");
      } else {
        setRawIncident(data);
        setIncident(mapToInvestigationIncident(data, count));
      }
    }).catch((err: unknown) => {
      if (cancelled) return;
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 404 ? "Incident not found" : "Failed to load incident. Please try again.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <IncidentDetailSkeleton />;

  if (error || !incident) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">{error ?? "Incident not found"}</p>
        <button onClick={() => router.push("/incidents")} className="btn btn-sm btn-secondary">
          Back to Incidents
        </button>
      </div>
    );
  }

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === "graph" && entityGraph === null && !graphLoading) {
      setGraphLoading(true);
      incidentService.getEntityGraph(Number(id)).then((g) => {
        setEntityGraph(g);
        setGraphLoading(false);
      });
    }
  };

  const handleStatusChange = (s: IStatus) => {
    setIncident((prev) => prev ? { ...prev, status: s } : prev);
  };

  const handleAssign = async (assigneeLogin: string | null) => {
    if (!rawIncident) return;
    try {
      const updated = await incidentService.assignIncident(rawIncident, assigneeLogin);
      setRawIncident(updated);
      setIncident((prev) => prev ? { ...prev, assignee: assigneeLogin ?? undefined } : prev);
      toast("success", assigneeLogin ? `Assigned to ${assigneeLogin}` : "Unassigned");
    } catch {
      toast("error", "Failed to update assignment");
    }
  };

  const handleSoarLaunch = async (_playbookId: string) => {  // eslint-disable-line @typescript-eslint/no-unused-vars
    await new Promise((r) => setTimeout(r, 1800));
  };

  const handleViewLogs = () => {
    if (!rawIncident) return;
    const url = buildAlertPivotUrl({
      alertId: rawIncident.id,
      alertName: rawIncident.incidentName,
      timestamp: rawIncident.incidentCreatedDate ?? new Date().toISOString(),
    });
    router.push(url);
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - 80px)", margin: "-24px", width: "calc(100% + 48px)" }}
    >
      {/* ── Incident header ────────────────────────────────── */}
      <InvestigationHeader
        incident={incident}
        onStatusChange={handleStatusChange}
        onAddEvidence={() => setShowAddEvidence(true)}
        onLaunchSoar={() => setShowSoar(true)}
        onAddNote={() => setShowNoteModal(true)}
        onGenerateSummary={() => setShowSummary(true)}
        onViewLogs={handleViewLogs}
      />
      {/* ── Assignee selector ──────────────────────────────── */}
      <div className="px-4 py-2 bg-surface-primary border-b border-surface-border shrink-0">
        <AssigneeSelector
          currentAssignee={rawIncident?.incidentAssignedTo}
          onAssign={handleAssign}
        />
      </div>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-4 bg-surface-primary border-b border-surface-border shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-small font-medium transition-colors border-b-2 -mb-px",
              activeTab === t.id
                ? "text-brand border-brand"
                : "text-muted border-transparent hover:text-secondary"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "evidence" && (
          <InvestigationEvidenceBoard
            initialCards={DEMO_EVIDENCE}
            showAddModal={showAddEvidence}
            onCloseAddModal={() => setShowAddEvidence(false)}
          />
        )}
        {activeTab === "timeline" && (
          <InvestigationTimeline events={DEMO_TIMELINE} />
        )}
        {activeTab === "graph" && (
          graphLoading ? (
            <div className="flex items-center justify-center h-full gap-3 text-muted">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-small">Loading entity graph…</span>
            </div>
          ) : entityGraph && entityGraph.nodes.length > 0 ? (
            <InvestigationEntityGraph graph={entityGraph} />
          ) : entityGraph && entityGraph.nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted">
              <span className="text-small">No entity data found for this incident.</span>
              <span className="text-tiny">Link alerts to this incident to populate the graph.</span>
            </div>
          ) : null
        )}
      </div>

      {/* ── SOAR Launcher ──────────────────────────────────── */}
      {showSoar && (
        <AlertSoarLauncher
          alertCount={incident.alertCount}
          onLaunch={handleSoarLaunch}
          onClose={() => setShowSoar(false)}
        />
      )}

      {/* ── AI Summary Modal ──────────────────────────────── */}
      {showSummary && (
        <IncidentSummaryModal
          incident={incident}
          onClose={() => setShowSummary(false)}
        />
      )}

      {/* ── Quick Note Modal ───────────────────────────────── */}
      {showNoteModal && (
        <NoteModal
          onClose={() => setShowNoteModal(false)}
          onSave={() => {
            setShowNoteModal(false);
            setShowAddEvidence(false);
            // In real impl would add note to evidence board
          }}
        />
      )}
    </div>
  );
}

// ── AI Summary modal ──────────────────────────────────────────────────────────

function IncidentSummaryModal({
  incident,
  onClose,
}: {
  incident: InvestigationIncident;
  onClose: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const severityLabel = incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1);
  const statusLabel = incident.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const generate = async () => {
    setGenerating(true);
    // Simulate generation delay; in a real impl this would call a summary endpoint
    await new Promise((r) => setTimeout(r, 1200));
    const lines = [
      `**${incident.name}**`,
      "",
      `**Severity:** ${severityLabel} | **Status:** ${statusLabel} | **Alerts:** ${incident.alertCount}`,
      incident.assignee ? `**Assigned to:** ${incident.assignee}` : "",
      "",
      incident.mitreTactics.length
        ? `**MITRE Tactics:** ${incident.mitreTactics.join(", ")}`
        : "",
      incident.tags.length ? `**Tags:** ${incident.tags.join(", ")}` : "",
      "",
      "**Summary:** This incident involves " +
        `${incident.alertCount} correlated alert${incident.alertCount !== 1 ? "s" : ""} ` +
        `with a ${severityLabel.toLowerCase()} severity classification. ` +
        (incident.mitreTactics.length
          ? `The observed MITRE ATT&CK tactics include ${incident.mitreTactics.join(", ")}, ` +
            "suggesting a multi-stage attack pattern. "
          : "") +
        "Immediate investigation and containment actions are recommended.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    setSummary(lines);
    setGenerating(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] z-[70] mx-auto max-w-lg bg-surface-primary rounded-xl border border-surface-border shadow-drawer animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-brand" />
            <h3 className="text-small font-semibold text-primary">Generate Incident Summary</h3>
          </div>
          <button onClick={onClose} className="toolbar-btn">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {!summary && !generating && (
            <p className="text-small text-secondary">
              Generate an AI-assisted summary of this incident, including severity, MITRE tactics, and recommended actions.
            </p>
          )}
          {generating && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-small text-muted">Generating summary…</span>
            </div>
          )}
          {summary && (
            <div className="bg-surface-secondary rounded-lg p-4 text-small text-secondary whitespace-pre-wrap border border-surface-border">
              {summary}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-surface-border">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Close</button>
          {!summary && (
            <button
              onClick={generate}
              disabled={generating}
              className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
            >
              <Brain className="w-3.5 h-3.5" /> Generate
            </button>
          )}
          {summary && (
            <button
              onClick={() => navigator.clipboard.writeText(summary)}
              className="btn btn-sm btn-secondary"
            >
              Copy
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Note modal ────────────────────────────────────────────────────────────────

function NoteModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [text, setText] = useState("");
  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/3 z-[70] mx-auto max-w-md bg-surface-primary rounded-xl border border-surface-border shadow-drawer animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h3 className="text-small font-semibold text-primary">Add Analyst Note</h3>
          <button onClick={onClose} className="toolbar-btn">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="p-4">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter analyst findings, hypotheses, or observations…"
            className="input-base w-full text-small resize-none h-32"
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-surface-border">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
          <button onClick={onSave} disabled={!text.trim()} className="btn btn-sm btn-primary disabled:opacity-50">
            Save Note
          </button>
        </div>
      </div>
    </>
  );
}
