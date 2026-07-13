"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Layers, Shield, Plus, Trash2, Edit2, Search, RefreshCw,
  ChevronRight, Loader2, Check, X, Send,
} from "lucide-react";
import { agentGroupsService, type AgentGroup, type AgentPolicy } from "@/services/agent-groups.service";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Tab = "agents" | "groups" | "policies";

interface AgentRow {
  id: number;
  hostname: string;
  ip: string;
  os: string;
  platform: string;
  status: string;
  version: string;
  lastSeen: string;
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE:  "text-success bg-success/10",
  OFFLINE: "text-muted bg-surface-tertiary",
  UNKNOWN: "text-warning bg-warning/10",
};

// ─── Agents Tab ─────────────────────────────────────────────────────────────

function AgentsTab() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getWithHeaders<AgentRow[]>("/api/agent-manager/agents?pageSize=500");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch { setAgents([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = agents.filter(a =>
    a.hostname?.toLowerCase().includes(search.toLowerCase()) ||
    a.ip?.includes(search)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter agents…" className="input-base pl-8 w-full text-small" />
        </div>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 ml-auto disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
        <span className="text-tiny text-muted">{visible.length} agents</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading agents…
          </div>
        ) : (
          <table className="w-full text-small">
            <thead className="sticky top-0 bg-surface-secondary border-b border-surface-border">
              <tr>
                {["Hostname", "IP", "OS", "Platform", "Version", "Status", "Last Seen"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-tiny font-semibold text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(a => (
                <tr key={a.id}
                  onClick={() => router.push(`/agents/${a.id}`)}
                  className="border-b border-surface-border hover:bg-surface-secondary transition-colors cursor-pointer">
                  <td className="px-4 py-2.5 font-medium text-primary">{a.hostname}</td>
                  <td className="px-4 py-2.5 font-mono text-tiny text-secondary">{a.ip}</td>
                  <td className="px-4 py-2.5 text-secondary">{a.os}</td>
                  <td className="px-4 py-2.5 text-secondary capitalize">{a.platform}</td>
                  <td className="px-4 py-2.5 text-muted">{a.version}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-tiny font-semibold px-1.5 py-0.5 rounded capitalize", STATUS_COLOR[a.status] ?? STATUS_COLOR.UNKNOWN)}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-tiny text-muted">{a.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Groups Tab ─────────────────────────────────────────────────────────────

function GroupsTab() {
  const [groups, setGroups]   = useState<AgentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<AgentGroup> | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setGroups(await agentGroupsService.listGroups()); }
    catch { setGroups([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.groupName?.trim()) { toast("error", "Name required", ""); return; }
    setWorking("save");
    try {
      if (editing.id) {
        await agentGroupsService.updateGroup(editing.id, editing);
        toast("success", "Group updated", editing.groupName);
      } else {
        await agentGroupsService.createGroup(editing);
        toast("success", "Group created", editing.groupName);
      }
      await load();
      setEditing(null);
    } catch (e: unknown) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally { setWorking(null); }
  };

  const handleDelete = async (id: number) => {
    setWorking("del:" + id);
    try {
      await agentGroupsService.deleteGroup(id);
      setGroups(prev => prev.filter(g => g.id !== id));
      toast("success", "Group deleted", "");
    } catch (e: unknown) {
      toast("error", "Delete failed", e instanceof Error ? e.message : "");
    } finally { setWorking(null); setConfirmDel(null); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <Layers className="w-4 h-4 text-brand shrink-0" />
        <p className="text-small font-semibold text-primary flex-1">Agent Groups</p>
        <button onClick={() => setEditing({ groupName: "", description: "", platform: "" })} className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Group
        </button>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {editing && (
        <div className="border-b border-surface-border bg-surface-secondary p-4 space-y-3 shrink-0">
          <p className="text-small font-semibold text-primary">{editing.id ? "Edit Group" : "New Group"}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-tiny text-muted mb-1 block">Name *</label>
              <input value={editing.groupName ?? ""} onChange={e => setEditing({...editing, groupName: e.target.value})}
                className="input-base w-full text-small" placeholder="Group name" />
            </div>
            <div>
              <label className="text-tiny text-muted mb-1 block">Platform</label>
              <input value={editing.platform ?? ""} onChange={e => setEditing({...editing, platform: e.target.value})}
                className="input-base w-full text-small" placeholder="windows / linux / any" />
            </div>
            <div>
              <label className="text-tiny text-muted mb-1 block">Description</label>
              <input value={editing.description ?? ""} onChange={e => setEditing({...editing, description: e.target.value})}
                className="input-base w-full text-small" placeholder="Optional description" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={working === "save"} className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50">
              {working === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
            </button>
            <button onClick={() => setEditing(null)} className="btn btn-sm btn-secondary"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading groups…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-small text-muted">
            <Layers className="w-8 h-8 opacity-30" />
            <p>No groups yet. Create one to organize your agents.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(g => (
              <div key={g.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                    <ChevronRight className={cn("w-3.5 h-3.5 text-muted transition-transform", expanded === g.id && "rotate-90")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-small font-medium text-primary">{g.groupName}</p>
                      <p className="text-tiny text-muted">
                        {g.memberCount} agents{g.platform ? ` · ${g.platform}` : ""}{g.description ? ` · ${g.description}` : ""}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(g)} title="Edit"
                      className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand/10 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {confirmDel === g.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(g.id)} disabled={working === "del:"+g.id}
                          className="text-tiny px-2 py-0.5 rounded bg-critical/15 text-critical border border-critical/20 disabled:opacity-50">
                          {working === "del:"+g.id ? "…" : "Confirm"}
                        </button>
                        <button onClick={() => setConfirmDel(null)} className="text-tiny px-2 py-0.5 rounded text-muted">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDel(g.id)} title="Delete"
                        className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {expanded === g.id && g.memberAgentIds.length > 0 && (
                  <div className="border-t border-surface-border bg-surface-secondary px-4 py-2">
                    <p className="text-tiny text-muted">Agent IDs: {g.memberAgentIds.join(", ")}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Policies Tab ────────────────────────────────────────────────────────────

function PoliciesTab() {
  const [policies, setPolicies] = useState<AgentPolicy[]>([]);
  const [groups, setGroups]     = useState<AgentGroup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<Partial<AgentPolicy> | null>(null);
  const [working, setWorking]   = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([agentGroupsService.listPolicies(), agentGroupsService.listGroups()]);
      setPolicies(p);
      setGroups(g);
    } catch { setPolicies([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editing?.policyName?.trim()) { toast("error", "Name required", ""); return; }
    if (!editing.policyConfig) editing.policyConfig = "{}";
    setWorking("save");
    try {
      if (editing.id) {
        await agentGroupsService.updatePolicy(editing.id, editing);
        toast("success", "Policy updated", editing.policyName);
      } else {
        await agentGroupsService.createPolicy(editing);
        toast("success", "Policy created", editing.policyName);
      }
      await load();
      setEditing(null);
    } catch (e: unknown) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally { setWorking(null); }
  };

  const handleDelete = async (id: number) => {
    setWorking("del:" + id);
    try {
      await agentGroupsService.deletePolicy(id);
      setPolicies(prev => prev.filter(p => p.id !== id));
      toast("success", "Policy deleted", "");
    } catch (e: unknown) {
      toast("error", "Delete failed", e instanceof Error ? e.message : "");
    } finally { setWorking(null); setConfirmDel(null); }
  };

  const handlePush = async (policyId: number, groupId: number) => {
    setWorking("push:" + policyId + ":" + groupId);
    try {
      await agentGroupsService.pushPolicyToGroup(policyId, groupId);
      toast("success", "Push triggered", "Agents in group will receive the policy");
    } catch (e: unknown) {
      toast("error", "Push failed", e instanceof Error ? e.message : "");
    } finally { setWorking(null); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <Shield className="w-4 h-4 text-brand shrink-0" />
        <p className="text-small font-semibold text-primary flex-1">Agent Policies</p>
        <button onClick={() => setEditing({ policyName: "", description: "", platform: "", policyConfig: "{}", isActive: true })}
          className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Policy
        </button>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {editing && (
        <div className="border-b border-surface-border bg-surface-secondary p-4 space-y-3 shrink-0">
          <p className="text-small font-semibold text-primary">{editing.id ? "Edit Policy" : "New Policy"}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-tiny text-muted mb-1 block">Name *</label>
              <input value={editing.policyName ?? ""} onChange={e => setEditing({...editing, policyName: e.target.value})}
                className="input-base w-full text-small" />
            </div>
            <div>
              <label className="text-tiny text-muted mb-1 block">Platform</label>
              <input value={editing.platform ?? ""} onChange={e => setEditing({...editing, platform: e.target.value})}
                className="input-base w-full text-small" placeholder="windows / linux / any" />
            </div>
            <div>
              <label className="text-tiny text-muted mb-1 block">Description</label>
              <input value={editing.description ?? ""} onChange={e => setEditing({...editing, description: e.target.value})}
                className="input-base w-full text-small" />
            </div>
          </div>
          <div>
            <label className="text-tiny text-muted mb-1 block">Policy Config (JSON)</label>
            <textarea value={editing.policyConfig ?? "{}"} rows={5} spellCheck={false}
              onChange={e => setEditing({...editing, policyConfig: e.target.value})}
              className="w-full bg-surface-tertiary text-tiny font-mono text-secondary p-3 rounded border border-surface-border focus:outline-none focus:ring-1 focus:ring-brand/50 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={working === "save"} className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50">
              {working === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
            </button>
            <button onClick={() => setEditing(null)} className="btn btn-sm btn-secondary"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading policies…
          </div>
        ) : policies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-small text-muted">
            <Shield className="w-8 h-8 opacity-30" />
            <p>No policies yet. Create one to manage agent configurations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map(p => (
              <div key={p.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    <ChevronRight className={cn("w-3.5 h-3.5 text-muted transition-transform", expanded === p.id && "rotate-90")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-small font-medium text-primary">{p.policyName}</span>
                        <span className="text-tiny text-muted">v{p.versionNum}</span>
                        <span className={cn("text-tiny px-1.5 py-0.5 rounded font-semibold",
                          p.isActive ? "text-success bg-success/10" : "text-muted bg-surface-tertiary")}>
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                        {p.platform && <span className="text-tiny text-muted">{p.platform}</span>}
                      </div>
                      {p.description && <p className="text-tiny text-muted">{p.description}</p>}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(p)} title="Edit"
                      className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand/10">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {confirmDel === p.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(p.id)} disabled={working === "del:"+p.id}
                          className="text-tiny px-2 py-0.5 rounded bg-critical/15 text-critical border border-critical/20 disabled:opacity-50">
                          {working === "del:"+p.id ? "…" : "Confirm"}
                        </button>
                        <button onClick={() => setConfirmDel(null)} className="text-tiny px-2 py-0.5 rounded text-muted">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDel(p.id)} title="Delete"
                        className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {expanded === p.id && (
                  <div className="border-t border-surface-border bg-surface-secondary px-4 py-3 space-y-3">
                    <pre className="text-tiny font-mono text-muted overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                      {p.policyConfig}
                    </pre>
                    {groups.length > 0 && (
                      <div>
                        <p className="text-tiny font-semibold text-secondary mb-2">Push to group</p>
                        <div className="flex flex-wrap gap-2">
                          {groups.map(g => {
                            const wKey = "push:"+p.id+":"+g.id;
                            const assigned = p.assignedGroupIds?.includes(g.id);
                            return (
                              <button key={g.id}
                                onClick={() => handlePush(p.id, g.id)}
                                disabled={working !== null}
                                className={cn(
                                  "flex items-center gap-1.5 text-tiny px-2 py-1 rounded border transition-colors disabled:opacity-50",
                                  assigned
                                    ? "border-brand/30 text-brand bg-brand/5 hover:bg-brand/15"
                                    : "border-surface-border text-muted hover:text-secondary hover:border-secondary"
                                )}>
                                {working === wKey
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Send className="w-3 h-3" />}
                                {g.groupName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "agents",   label: "Agents",   icon: <Users  className="w-3.5 h-3.5" /> },
  { id: "groups",   label: "Groups",   icon: <Layers className="w-3.5 h-3.5" /> },
  { id: "policies", label: "Policies", icon: <Shield className="w-3.5 h-3.5" /> },
];

export default function AgentsPage() {
  const [tab, setTab] = useState<Tab>("agents");

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div>
          <h1 className="text-h3 font-bold text-primary">Agents</h1>
          <p className="text-tiny text-muted">Manage agents, groups, and configuration policies</p>
        </div>
      </div>
      <div className="flex items-center gap-1 px-6 border-b border-surface-border shrink-0 bg-surface-secondary">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-small font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-secondary hover:border-surface-border"
            )}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "agents"   && <AgentsTab />}
        {tab === "groups"   && <GroupsTab />}
        {tab === "policies" && <PoliciesTab />}
      </div>
    </div>
  );
}
