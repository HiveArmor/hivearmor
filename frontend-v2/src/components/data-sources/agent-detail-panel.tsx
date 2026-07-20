"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Server, Clock, Activity, Terminal,
  Trash2, ChevronRight, RefreshCw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { agentService, type Agent } from "@/services/agent.service";
import { formatDistanceToNow, format } from "date-fns";

interface AgentDetailPanelProps {
  agent: Agent;
  onClose: () => void;
  onDeleted: () => void;
}

function parseLastSeen(lastSeen: string): Date {
  return new Date(lastSeen.includes("Z") || lastSeen.includes("+") ? lastSeen : lastSeen.replace(" ", "T") + "Z");
}

function healthLabel(lastSeen?: string): { label: string; color: string; dot: string } {
  if (!lastSeen) return { label: "Never connected", color: "text-zinc-400", dot: "bg-zinc-500" };
  const ageMs = Date.now() - parseLastSeen(lastSeen).getTime();
  if (ageMs < 5 * 60 * 1000)   return { label: "Online",  color: "text-green-400", dot: "bg-green-500" };
  if (ageMs < 60 * 60 * 1000)  return { label: "Stale",   color: "text-yellow-400", dot: "bg-yellow-400" };
  return { label: "Offline", color: "text-red-400", dot: "bg-red-500" };
}

function FieldRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-surface-border last:border-0">
      <span className="text-tiny text-muted flex-shrink-0 w-32">{label}</span>
      <span className={cn("text-small text-secondary text-right break-all", mono && "font-mono text-tiny")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export function AgentDetailPanel({ agent, onClose, onDeleted }: AgentDetailPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveAgent, setLiveAgent] = useState<Agent>(agent);

  const health = healthLabel(liveAgent.lastSeen);

  const loadEventCount = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await api.get<{ count: number }>(
        `/api/ha-data-input-statuses/count?source.contains=${encodeURIComponent(liveAgent.agentIp)}`
      );
      setEventCount(res?.count ?? null);
    } catch {
      setEventCount(null);
    } finally {
      setLoadingEvents(false);
    }
  }, [liveAgent.agentIp]);

  const refreshAgent = useCallback(async () => {
    try {
      const agents = await agentService.listAgents(0, 500);
      const updated = agents.content.find((a) => a.id === agent.id);
      if (updated) setLiveAgent(updated);
    } catch {
      // keep stale data
    }
  }, [agent.id]);

  useEffect(() => {
    loadEventCount();
    refreshAgent();
  }, [loadEventCount, refreshAgent, refreshKey]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await agentService.deleteAgent(liveAgent.id);
      toast("success", "Agent removed");
      onDeleted();
    } catch {
      toast("error", "Failed to remove agent");
    } finally {
      setDeleting(false);
    }
  };

  const modules: string[] = liveAgent.modules ?? [];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex">
      <div className="absolute inset-0 right-[480px] bg-transparent" onClick={onClose} />
      <div className="relative w-[480px] bg-surface-primary border-l border-surface-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-surface-tertiary flex items-center justify-center flex-shrink-0">
              <Server className="w-4 h-4 text-muted" />
            </div>
            <div className="min-w-0">
              <h3 className="text-h4 text-primary truncate">{liveAgent.agentName}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", health.dot)} />
                <span className={cn("text-tiny font-medium", health.color)}>{health.label}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stat row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-tiny">Last heartbeat</span>
              </div>
              <p className="text-small font-medium text-primary">
                {liveAgent.lastSeen
                  ? formatDistanceToNow(parseLastSeen(liveAgent.lastSeen), { addSuffix: true })
                  : "Never"}
              </p>
              {liveAgent.lastSeen && (
                <p className="text-tiny text-muted font-mono">
                  {format(parseLastSeen(liveAgent.lastSeen), "MMM d, HH:mm:ss")}
                </p>
              )}
            </div>
            <div className="card p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-muted">
                <Activity className="w-3.5 h-3.5" />
                <span className="text-tiny">Events (24h)</span>
              </div>
              <p className="text-small font-medium text-primary">
                {loadingEvents ? (
                  <span className="text-muted">Loading…</span>
                ) : eventCount != null ? (
                  eventCount.toLocaleString()
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>

          {/* Agent details */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-border bg-surface-secondary">
              <span className="text-tiny text-muted font-medium uppercase tracking-wider">Agent Info</span>
            </div>
            <div className="px-4 divide-y divide-surface-border">
              <FieldRow label="IP Address" value={liveAgent.agentIp} mono />
              <FieldRow label="Hostname" value={liveAgent.agentName} />
              <FieldRow label="OS" value={liveAgent.agentOs} />
              <FieldRow label="Platform" value={liveAgent.agentPlatform} />
              <FieldRow label="Agent Version" value={liveAgent.agentVersion} mono />
              <FieldRow label="Agent Type" value={liveAgent.agentType} />
            </div>
          </div>

          {/* Modules */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-border bg-surface-secondary flex items-center justify-between">
              <span className="text-tiny text-muted font-medium uppercase tracking-wider">Modules Enabled</span>
              {modules.length > 0 && (
                <span className="text-tiny text-muted">{modules.length}</span>
              )}
            </div>
            <div className="p-4">
              {modules.length === 0 ? (
                <p className="text-small text-muted text-center py-2">No module data available</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {modules.map((m) => (
                    <span
                      key={m}
                      className="px-2 py-0.5 rounded-md bg-brand/10 text-brand text-tiny font-medium border border-brand/20"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Groups */}
          {liveAgent.agentGroups && liveAgent.agentGroups.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-surface-border bg-surface-secondary">
                <span className="text-tiny text-muted font-medium uppercase tracking-wider">Groups</span>
              </div>
              <div className="p-4 flex flex-wrap gap-1.5">
                {liveAgent.agentGroups.map((g) => (
                  <span key={g} className="px-2 py-0.5 rounded-md bg-surface-tertiary text-secondary text-tiny border border-surface-border">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-border bg-surface-secondary">
              <span className="text-tiny text-muted font-medium uppercase tracking-wider">Quick Actions</span>
            </div>
            <div className="divide-y divide-surface-border">
              <button
                onClick={() => {
                  const url = `/incidents?agentIp=${encodeURIComponent(liveAgent.agentIp)}`;
                  window.open(url, "_self");
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-tertiary transition-colors group"
              >
                <div className="flex items-center gap-2.5 text-small text-secondary group-hover:text-primary">
                  <Terminal className="w-4 h-4 text-muted" />
                  View incidents for this agent
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted" />
              </button>
              <button
                onClick={() => {
                  const url = `/logs?dataType=${encodeURIComponent(liveAgent.agentType || "")}&source=${encodeURIComponent(liveAgent.agentIp)}`;
                  window.open(url, "_self");
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-tertiary transition-colors group"
              >
                <div className="flex items-center gap-2.5 text-small text-secondary group-hover:text-primary">
                  <Activity className="w-4 h-4 text-muted" />
                  View logs from this agent
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer — remove agent */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-surface-border">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-small text-secondary flex-1">Remove this agent? This cannot be undone.</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-small font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Removing…" : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg border border-surface-border text-small text-secondary hover:text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-small text-muted hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
