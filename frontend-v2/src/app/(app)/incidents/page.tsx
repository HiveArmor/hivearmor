"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Kanban, Table, Clock, User, AlertTriangle, ChevronRight, X, Search,
  Flag, Timer, TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { toast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { incidentService, IncidentStatus } from "@/services/incident.service";
import type { Incident } from "@/services/incident.service";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AssigneeSelector } from "@/components/incidents/assignee-selector";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { api } from "@/lib/api";

type ViewMode = "board" | "table";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ── Helpers ─────────────────────────────────────────────────────────────────

function severityToLabel(s: number): "critical" | "high" | "medium" | "low" | "info" {
  if (s >= 4) return "critical";
  if (s >= 3) return "high";
  if (s >= 2) return "medium";
  if (s >= 1) return "low";
  return "info";
}

function severityBorderColor(s: number): string {
  if (s >= 4) return "border-l-critical";
  if (s >= 3) return "border-l-high";
  if (s >= 2) return "border-l-medium";
  if (s >= 1) return "border-l-low";
  return "border-l-low";
}

function statusLabel(status: string): string {
  switch (status) {
    case IncidentStatus.OPEN: return "Open";
    case IncidentStatus.IN_REVIEW: return "In Progress";
    case IncidentStatus.COMPLETED: return "Completed";
    default: return "Unknown";
  }
}

// ── Priority badge ────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-critical/15 text-critical border-critical/30",
  P2: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  P3: "bg-warning/15 text-warning border-warning/30",
  P4: "bg-brand/10 text-brand border-brand/20",
};

function PriorityBadge({ priority }: { priority?: string }) {
  const p = priority ?? "P3";
  return (
    <span className={cn("text-micro px-1.5 py-0.5 rounded border font-medium", PRIORITY_COLORS[p] || PRIORITY_COLORS.P3)}>
      {p}
    </span>
  );
}

function SlaCountdown({ deadline, breached }: { deadline?: string; breached?: boolean }) {
  if (!deadline) return null;
  const dl = new Date(deadline);
  const minsLeft = differenceInMinutes(dl, new Date());
  if (breached || minsLeft <= 0) {
    return (
      <span className="text-micro flex items-center gap-1 text-critical">
        <TriangleAlert className="w-3 h-3" /> SLA breached
      </span>
    );
  }
  const h = Math.floor(minsLeft / 60);
  const m = minsLeft % 60;
  const color = minsLeft < 30 ? "text-critical" : minsLeft < 120 ? "text-warning" : "text-muted";
  return (
    <span className={cn("text-micro flex items-center gap-1", color)}>
      <Timer className="w-3 h-3" />
      {h > 0 ? `${h}h ${m}m` : `${m}m`} left
    </span>
  );
}

// ── Priority setter ───────────────────────────────────────────────────────

async function setPriority(id: number, priority: string): Promise<Incident> {
  return api.put<Incident>(`/api/ha-incidents/${id}/priority`, { priority });
}

export default function IncidentsPage() {
  const [incidents, setIncidents]           = useState<Incident[]>([]);
  const [loading, setLoading]               = useState(true);
  const [viewMode, setViewMode]             = useState<ViewMode>("board");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showCreateModal, setShowCreateModal]   = useState(false);
  const [newIncident, setNewIncident]       = useState({ name: "", description: "", severity: 2, priority: "P3" });
  const [searchQuery, setSearchQuery]       = useState("");
  const [showMine, setShowMine]             = useState(false);
  const [currentPage, setCurrentPage]       = useState(0);
  const [pageSize, setPageSize]             = useState(25);
  const [total, setTotal]                   = useState(0);
  const currentUser = useCurrentUser();

  const totalPages = Math.ceil(total / pageSize);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await incidentService.list(currentPage, pageSize);
      setIncidents(result.content);
      setTotal(result.totalElements);
    } catch {
      toast("error", "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  const handleCreate = async () => {
    try {
      const created = await incidentService.create({
        incidentName:        newIncident.name,
        incidentDescription: newIncident.description,
        incidentSeverity:    newIncident.severity,
        incidentStatus:      IncidentStatus.OPEN,
        incidentPriority:    newIncident.priority,
      } as Partial<Incident>);
      // apply SLA immediately
      if (created?.id) {
        await setPriority(created.id, newIncident.priority);
      }
      toast("success", "Incident created");
      setShowCreateModal(false);
      setNewIncident({ name: "", description: "", severity: 2, priority: "P3" });
      loadIncidents();
    } catch {
      toast("error", "Failed to create incident");
    }
  };

  const handleStatusChange = async (incident: Incident, newStatus: string) => {
    try {
      await incidentService.updateStatus(incident, newStatus);
      toast("success", "Status updated");
      loadIncidents();
      if (selectedIncident?.id === incident.id) {
        setSelectedIncident({ ...incident, incidentStatus: newStatus });
      }
    } catch {
      toast("error", "Failed to update status");
    }
  };

  const handleAssign = async (incident: Incident, assigneeLogin: string | null) => {
    try {
      const updated = await incidentService.assignIncident(incident, assigneeLogin);
      setIncidents(is => is.map(i => i.id === incident.id ? { ...i, ...updated } : i));
      if (selectedIncident?.id === incident.id) {
        setSelectedIncident(prev => prev ? { ...prev, ...updated } : prev);
      }
      toast("success", assigneeLogin ? `Assigned to ${assigneeLogin}` : "Unassigned");
    } catch {
      toast("error", "Failed to update assignment");
    }
  };

  const handlePriorityChange = async (incident: Incident, priority: string) => {
    try {
      const updated = await setPriority(incident.id, priority);
      setIncidents(is => is.map(i => i.id === incident.id ? { ...i, ...updated } : i));
      if (selectedIncident?.id === incident.id) {
        setSelectedIncident(prev => prev ? { ...prev, ...updated } : prev);
      }
      toast("success", `Priority set to ${priority}`);
    } catch {
      toast("error", "Failed to update priority");
    }
  };

  // Filter by search and "My incidents"
  const filtered = incidents.filter(i => {
    if (showMine && currentUser && i.incidentAssignedTo !== currentUser.login) return false;
    if (!searchQuery) return true;
    return (
      i.incidentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (i.incidentDescription ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const openIncidents       = filtered.filter(i => i.incidentStatus === IncidentStatus.OPEN);
  const inProgressIncidents = filtered.filter(i => i.incidentStatus === IncidentStatus.IN_REVIEW);
  const completedIncidents  = filtered.filter(i => i.incidentStatus === IncidentStatus.COMPLETED);

  const slaBreachedCount = filtered.filter(i =>
    i.slaBreached || (i.slaDeadline && new Date(i.slaDeadline) < new Date())
  ).length;

  const columns = [
    { title: "Open",        items: openIncidents,       status: IncidentStatus.OPEN },
    { title: "In Progress", items: inProgressIncidents, status: IncidentStatus.IN_REVIEW },
    { title: "Completed",   items: completedIncidents,  status: IncidentStatus.COMPLETED },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-surface-border bg-surface-primary flex items-center justify-between">
          <div>
            <h1 className="text-h1">Incidents</h1>
            <p className="text-secondary text-small mt-0.5">
              {total > 0 ? `${total} total incidents` : "Track and manage security incidents"}
              {slaBreachedCount > 0 && (
                <span className="ml-2 text-micro px-1.5 py-0.5 rounded-full bg-critical/10 text-critical border border-critical/20">
                  {slaBreachedCount} SLA breach{slaBreachedCount > 1 ? "es" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Page size */}
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
              className="input-base text-small h-8 pr-7"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size} per page</option>
              ))}
            </select>
            {/* My incidents filter */}
            {currentUser && (
              <label className="flex items-center gap-1.5 text-small text-secondary cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showMine}
                  onChange={e => { setShowMine(e.target.checked); setCurrentPage(0); }}
                  className="rounded"
                />
                My incidents
              </label>
            )}
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search incidents…"
                className="input-base pl-8 w-48 text-small h-8"
              />
            </div>
            {/* View toggle */}
            <div className="flex items-center bg-surface-tertiary rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("board")}
                className={cn(
                  "px-3 py-1.5 text-small rounded-md transition-colors flex items-center gap-1.5",
                  viewMode === "board" ? "bg-surface-primary text-primary shadow-sm" : "text-secondary"
                )}
              >
                <Kanban className="w-3.5 h-3.5" /> Board
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={cn(
                  "px-3 py-1.5 text-small rounded-md transition-colors flex items-center gap-1.5",
                  viewMode === "table" ? "bg-surface-primary text-primary shadow-sm" : "text-secondary"
                )}
              >
                <Table className="w-3.5 h-3.5" /> Table
              </button>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Create Incident
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex flex-col">
          <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6" />}
              title="No incidents"
              description="Incidents are created when alerts are escalated or automatically correlated."
              action={
                <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                  <Plus className="w-4 h-4" /> Create Incident
                </button>
              }
            />
          ) : viewMode === "board" ? (
            <div className="grid grid-cols-3 gap-4 h-full">
              {columns.map((col) => (
                <div key={col.title} className="flex flex-col bg-surface-secondary rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                    <h3 className="text-h4 text-primary">{col.title}</h3>
                    <span className="px-2 py-0.5 rounded-full text-tiny bg-surface-tertiary text-muted">
                      {col.items.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {col.items.map((incident) => (
                      <div
                        key={incident.id}
                        className={cn(
                          "card w-full text-left p-3 border-l-4 hover:shadow-md transition-shadow",
                          severityBorderColor(incident.incidentSeverity)
                        )}
                      >
                        <button onClick={() => setSelectedIncident(incident)} className="w-full text-left">
                          <div className="flex items-start justify-between mb-1.5 gap-2">
                            <span className="text-small text-primary font-medium line-clamp-2 flex-1">
                              {incident.incidentName}
                            </span>
                            <PriorityBadge priority={incident.incidentPriority} />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <SeverityBadge severity={severityToLabel(incident.incidentSeverity)} />
                            {incident.incidentAssignedTo && (
                              <span className="text-tiny text-muted flex items-center gap-1">
                                <User className="w-3 h-3" /> {incident.incidentAssignedTo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-tiny text-muted flex-wrap">
                            {incident.alertCount != null && <span>{incident.alertCount} alerts</span>}
                            {incident.incidentCreatedDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDistanceToNow(new Date(incident.incidentCreatedDate), { addSuffix: true })}
                              </span>
                            )}
                            <SlaCountdown deadline={incident.slaDeadline} breached={incident.slaBreached} />
                          </div>
                        </button>
                        <div className="flex justify-end mt-2">
                          <Link
                            href={`/incidents/${incident.id}`}
                            className="flex items-center gap-1 text-tiny text-brand hover:underline"
                          >
                            Investigate <ChevronRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table View */
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Name</th>
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Priority</th>
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Severity</th>
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Status</th>
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">SLA</th>
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Assigned To</th>
                      <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Created</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((incident) => (
                      <tr
                        key={incident.id}
                        onClick={() => setSelectedIncident(incident)}
                        className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 text-body text-primary">{incident.incidentName}</td>
                        <td className="px-4 py-3"><PriorityBadge priority={incident.incidentPriority} /></td>
                        <td className="px-4 py-3">
                          <SeverityBadge severity={severityToLabel(incident.incidentSeverity)} />
                        </td>
                        <td className="px-4 py-3 text-small text-secondary">{statusLabel(incident.incidentStatus)}</td>
                        <td className="px-4 py-3">
                          <SlaCountdown deadline={incident.slaDeadline} breached={incident.slaBreached} />
                        </td>
                        <td className="px-4 py-3 text-small text-secondary">{incident.incidentAssignedTo || "—"}</td>
                        <td className="px-4 py-3 text-small text-muted">
                          {incident.incidentCreatedDate
                            ? formatDistanceToNow(new Date(incident.incidentCreatedDate), { addSuffix: true })
                            : "—"}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <Link href={`/incidents/${incident.id}`} className="flex items-center gap-1 text-tiny text-brand hover:underline whitespace-nowrap">
                            Investigate <ChevronRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      {/* Detail Panel */}
      {selectedIncident && (
        <div className="w-[380px] border-l border-surface-border bg-surface-primary overflow-y-auto flex-shrink-0">
          <div className="p-4 border-b border-surface-border flex items-center justify-between">
            <h3 className="text-h3 text-primary">Incident Detail</h3>
            <button onClick={() => setSelectedIncident(null)} className="text-muted hover:text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PriorityBadge priority={selectedIncident.incidentPriority} />
                {selectedIncident.slaBreached && (
                  <span className="text-micro text-critical flex items-center gap-1">
                    <TriangleAlert className="w-3 h-3" /> SLA breached
                  </span>
                )}
              </div>
              <h4 className="text-h4 text-primary mb-1">{selectedIncident.incidentName}</h4>
              <p className="text-small text-secondary">{selectedIncident.incidentDescription || "No description"}</p>
            </div>

            {/* Priority selector */}
            <div>
              <span className="text-tiny text-muted mb-2 flex items-center gap-1.5">
                <Flag className="w-3 h-3" /> Priority
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                {["P1","P2","P3","P4"].map(p => (
                  <button
                    key={p}
                    onClick={() => handlePriorityChange(selectedIncident, p)}
                    className={cn(
                      "px-2.5 py-1 text-tiny rounded border transition-colors",
                      selectedIncident.incidentPriority === p
                        ? PRIORITY_COLORS[p]
                        : "bg-surface-tertiary text-secondary border-surface-border hover:text-primary"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* SLA */}
            {selectedIncident.slaDeadline && (
              <div>
                <span className="text-tiny text-muted mb-1 block">SLA Deadline</span>
                <div className="flex items-center gap-3">
                  <SlaCountdown deadline={selectedIncident.slaDeadline} breached={selectedIncident.slaBreached} />
                  <span className="text-tiny text-muted">
                    {new Date(selectedIncident.slaDeadline).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            <div>
              <span className="text-tiny text-muted">Severity</span>
              <div className="mt-1">
                <SeverityBadge severity={severityToLabel(selectedIncident.incidentSeverity)} />
              </div>
            </div>

            <div>
              <span className="text-tiny text-muted mb-2 block">Status</span>
              <div className="flex items-center gap-2">
                {[IncidentStatus.OPEN, IncidentStatus.IN_REVIEW, IncidentStatus.COMPLETED].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(selectedIncident, s)}
                    className={cn(
                      "px-2.5 py-1 text-tiny rounded transition-colors",
                      selectedIncident.incidentStatus === s
                        ? "bg-brand-subtle text-brand font-medium"
                        : "bg-surface-tertiary text-secondary hover:text-primary"
                    )}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <AssigneeSelector
                currentAssignee={selectedIncident.incidentAssignedTo}
                onAssign={(login) => handleAssign(selectedIncident, login)}
              />
            </div>

            {selectedIncident.incidentCreatedDate && (
              <div>
                <span className="text-tiny text-muted">Created</span>
                <p className="text-small text-primary mt-0.5">
                  {formatDistanceToNow(new Date(selectedIncident.incidentCreatedDate), { addSuffix: true })}
                </p>
              </div>
            )}

            {selectedIncident.alertCount != null && (
              <div>
                <span className="text-tiny text-muted">Associated Alerts</span>
                <p className="text-small text-primary mt-0.5">{selectedIncident.alertCount} alerts linked</p>
              </div>
            )}

            <div className="pt-2">
              <Link
                href={`/incidents/${selectedIncident.id}`}
                className="btn btn-sm btn-primary gap-1.5 w-full justify-center"
              >
                Open Full Investigation <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative card w-[480px] p-6 shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-primary">Create Incident</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-small text-secondary block mb-1">Name</label>
                <input
                  type="text"
                  value={newIncident.name}
                  onChange={(e) => setNewIncident((prev) => ({ ...prev, name: e.target.value }))}
                  className="input-base w-full"
                  placeholder="Incident name"
                />
              </div>
              <div>
                <label className="text-small text-secondary block mb-1">Description</label>
                <textarea
                  value={newIncident.description}
                  onChange={(e) => setNewIncident((prev) => ({ ...prev, description: e.target.value }))}
                  className="input-base w-full h-24 resize-none"
                  placeholder="Describe the incident..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-small text-secondary block mb-1">Severity</label>
                  <select
                    value={newIncident.severity}
                    onChange={(e) => setNewIncident((prev) => ({ ...prev, severity: Number(e.target.value) }))}
                    className="input-base w-full"
                  >
                    <option value={1}>Low</option>
                    <option value={2}>Medium</option>
                    <option value={3}>High</option>
                    <option value={4}>Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-small text-secondary block mb-1 flex items-center gap-1">
                    <Flag className="w-3 h-3" /> Priority / SLA
                  </label>
                  <select
                    value={newIncident.priority}
                    onChange={(e) => setNewIncident((prev) => ({ ...prev, priority: e.target.value }))}
                    className="input-base w-full"
                  >
                    <option value="P1">P1 — Critical (1h SLA)</option>
                    <option value="P2">P2 — High (4h SLA)</option>
                    <option value="P3">P3 — Medium (24h SLA)</option>
                    <option value="P4">P4 — Low (72h SLA)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleCreate} disabled={!newIncident.name.trim()} className="btn-primary">
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
