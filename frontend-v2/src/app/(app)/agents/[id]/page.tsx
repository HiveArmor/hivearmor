"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Loader2, Terminal, Layers, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { agentGroupsService, type AgentGroup, type AgentPolicyState } from "@/services/agent-groups.service";
import { cn } from "@/lib/utils";

interface AgentDetail {
  id: number;
  hostname: string;
  ip: string;
  mac: string;
  os: string;
  osMajorVersion: string;
  osMinorVersion: string;
  platform: string;
  version: string;
  status: string;
  lastSeen: string;
  aliases: string;
  addresses: string;
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE:  "text-success bg-success/10 border-success/20",
  OFFLINE: "text-muted bg-surface-tertiary border-surface-border",
  UNKNOWN: "text-warning bg-warning/10 border-warning/20",
};

const STATE_COLOR: Record<string, string> = {
  APPLIED:  "text-success bg-success/10",
  PENDING:  "text-warning bg-warning/10",
  DRIFT:    "text-critical bg-critical/10",
  FAILED:   "text-critical bg-critical/10",
};

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent]         = useState<AgentDetail | null>(null);
  const [groups, setGroups]       = useState<AgentGroup[]>([]);
  const [policyStates] = useState<AgentPolicyState[]>([]);
  const [loading, setLoading]     = useState(true);
  const [command, setCommand]     = useState("");
  const [cmdResult, setCmdResult] = useState<string | null>(null);
  const [cmdWorking, setCmdWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes] = await Promise.all([
        api.getWithHeaders<AgentDetail[]>(`/api/agent-manager/agents?searchQuery=${id}&pageSize=1`),
      ]);
      const found = (agentsRes.data ?? []).find(a => String(a.id) === String(id));
      setAgent(found ?? null);

      const allGroups = await agentGroupsService.listGroups();
      const numId = Number(id);
      const agentGroups = allGroups.filter(g => g.memberAgentIds.includes(numId));
      setGroups(agentGroups);
    } catch { setAgent(null); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendCommand = async () => {
    if (!command.trim()) return;
    setCmdWorking(true);
    setCmdResult(null);
    try {
      const res = await api.post<{ result?: string; output?: string }>("/api/agent-manager/send-command", {
        agentId: id,
        command: command.trim(),
        shell: "",
      });
      setCmdResult(typeof res === "object" && res !== null
        ? ((res as Record<string, string>).result ?? (res as Record<string, string>).output ?? JSON.stringify(res))
        : String(res));
    } catch (e: unknown) {
      setCmdResult("Error: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setCmdWorking(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full gap-2 text-small text-muted">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading agent…
    </div>
  );

  if (!agent) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-small text-muted">
      <p>Agent {id} not found.</p>
      <button onClick={() => router.push("/agents")} className="btn btn-sm btn-secondary gap-1.5">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Agents
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-border shrink-0">
        <button onClick={() => router.push("/agents")}
          className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-secondary hover:bg-surface-secondary">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-h3 font-bold text-primary">{agent.hostname}</h1>
            <span className={cn("text-tiny font-semibold px-2 py-0.5 rounded border capitalize",
              STATUS_COLOR[agent.status] ?? STATUS_COLOR.UNKNOWN)}>
              {agent.status}
            </span>
          </div>
          <p className="text-tiny text-muted font-mono">{agent.ip}{agent.mac ? ` · ${agent.mac}` : ""}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Info grid */}
        <div className="card p-4">
          <p className="text-small font-semibold text-primary mb-3">System Information</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "OS", value: `${agent.os} ${agent.osMajorVersion}.${agent.osMinorVersion}` },
              { label: "Platform", value: agent.platform },
              { label: "Agent Version", value: agent.version },
              { label: "Last Seen", value: agent.lastSeen },
              { label: "Addresses", value: agent.addresses || "—" },
              { label: "Aliases", value: agent.aliases || "—" },
              { label: "Agent ID", value: String(agent.id) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-tiny text-muted">{label}</p>
                <p className="text-small text-secondary font-mono">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-brand" />
            <p className="text-small font-semibold text-primary">Groups</p>
          </div>
          {groups.length === 0 ? (
            <p className="text-tiny text-muted">Not in any group.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <span key={g.id} className="text-tiny px-2 py-1 rounded bg-brand/10 text-brand border border-brand/20">
                  {g.groupName}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Policy States */}
        {policyStates.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-brand" />
              <p className="text-small font-semibold text-primary">Policy States</p>
            </div>
            <div className="space-y-2">
              {policyStates.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded bg-surface-secondary">
                  <span className={cn("text-tiny font-semibold px-1.5 py-0.5 rounded", STATE_COLOR[s.state] ?? "text-muted")}>
                    {s.state}
                  </span>
                  <span className="text-tiny text-secondary">Policy #{s.policyId}</span>
                  {s.appliedVersion != null && (
                    <span className="text-tiny text-muted">v{s.appliedVersion}{s.desiredVersion && s.desiredVersion !== s.appliedVersion ? ` → v${s.desiredVersion}` : ""}</span>
                  )}
                  {s.driftDetails && <span className="text-tiny text-critical">{s.driftDetails}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Command console */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-brand" />
            <p className="text-small font-semibold text-primary">Command Console</p>
          </div>
          <div className="flex gap-2">
            <input
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendCommand()}
              placeholder="Enter command…"
              className="input-base flex-1 text-small font-mono"
            />
            <button
              onClick={sendCommand}
              disabled={cmdWorking || !command.trim()}
              className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
            >
              {cmdWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
              Run
            </button>
          </div>
          {cmdResult != null && (
            <pre className="mt-3 bg-surface-tertiary text-tiny font-mono text-secondary p-3 rounded max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
              {cmdResult}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
