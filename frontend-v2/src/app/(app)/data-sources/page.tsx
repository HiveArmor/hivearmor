"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Trash2, Eye, MonitorCheck, MonitorX, Server, Users,
  FolderOpen, Radio, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { agentService } from "@/services/agent.service";
import type { Agent, AgentGroup, Collector } from "@/services/agent.service";
import { formatDistanceToNow } from "date-fns";

type Tab = "agents" | "groups" | "collectors" | "collector-groups";

function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff < 5 * 60 * 1000; // 5 minutes
}

export default function DataSourcesPage() {
  const [tab, setTab] = useState<Tab>("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentRes, groupRes, collectorRes] = await Promise.allSettled([
        agentService.listAgents(0, 100),
        agentService.listGroups(),
        agentService.listCollectors(0, 100),
      ]);
      if (agentRes.status === "fulfilled") setAgents(agentRes.value.content);
      if (groupRes.status === "fulfilled") setGroups(groupRes.value);
      if (collectorRes.status === "fulfilled") setCollectors(collectorRes.value.content);
    } catch {
      toast("error", "Failed to load data sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => {
    try {
      await agentService.deleteAgent(id);
      toast("success", "Agent deleted");
      setDeleteConfirm(null);
      loadData();
    } catch {
      toast("error", "Failed to delete agent");
    }
  };

  const onlineCount = agents.filter((a) => isOnline(a.lastSeen)).length;
  const offlineCount = agents.length - onlineCount;

  const filteredAgents = agents.filter((a) =>
    a.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.agentIp.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCollectors = collectors.filter((c) =>
    c.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.ip ?? "").includes(searchQuery)
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "agents", label: "Agents", icon: <Server className="w-3.5 h-3.5" /> },
    { id: "groups", label: "Groups", icon: <FolderOpen className="w-3.5 h-3.5" /> },
    { id: "collectors", label: "Collectors", icon: <Radio className="w-3.5 h-3.5" /> },
    { id: "collector-groups", label: "Collector Groups", icon: <Users className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Data Sources</h1>
          <p className="text-secondary text-small mt-0.5">Manage agents and data sources</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="card px-3 py-2 flex items-center gap-2">
            <MonitorCheck className="w-4 h-4 text-green-500" />
            <span className="text-small text-primary font-medium">{onlineCount}</span>
            <span className="text-tiny text-muted">Online</span>
          </div>
          <div className="card px-3 py-2 flex items-center gap-2">
            <MonitorX className="w-4 h-4 text-red-500" />
            <span className="text-small text-primary font-medium">{offlineCount}</span>
            <span className="text-tiny text-muted">Offline</span>
          </div>
          <div className="card px-3 py-2 flex items-center gap-2">
            <Server className="w-4 h-4 text-muted" />
            <span className="text-small text-primary font-medium">{agents.length}</span>
            <span className="text-tiny text-muted">Total</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSearchQuery(""); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-small transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-brand text-brand font-medium"
                : "border-transparent text-secondary hover:text-primary"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {(tab === "agents" || tab === "collectors") && (
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder={tab === "agents" ? "Search agents by name or IP..." : "Search collectors..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-base w-full pl-9"
          />
        </div>
      )}

      {/* Tab content */}
      {loading ? (
        <div className="card">
          <TableSkeleton rows={8} cols={6} />
        </div>
      ) : tab === "agents" ? (
        <div className="card overflow-hidden">
          {filteredAgents.length === 0 ? (
            <EmptyState
              icon={<Server className="w-6 h-6" />}
              title="No agents found"
              description={searchQuery ? "No agents match your search" : "Install agents on endpoints to start collecting data"}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">IP</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">OS</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Platform</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Version</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Last Seen</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent) => (
                    <tr key={agent.id} className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn(
                          "w-2.5 h-2.5 rounded-full inline-block",
                          isOnline(agent.lastSeen) ? "bg-green-500" : "bg-red-500"
                        )} />
                      </td>
                      <td className="px-4 py-3 text-body text-primary font-medium">{agent.agentName}</td>
                      <td className="px-4 py-3 text-small text-secondary font-mono">{agent.agentIp}</td>
                      <td className="px-4 py-3 text-small text-secondary">{agent.agentOs}</td>
                      <td className="px-4 py-3 text-small text-secondary">{agent.agentPlatform || "—"}</td>
                      <td className="px-4 py-3 text-tiny text-muted font-mono">{agent.agentVersion || "—"}</td>
                      <td className="px-4 py-3 text-small text-muted">
                        {agent.lastSeen
                          ? formatDistanceToNow(new Date(agent.lastSeen), { addSuffix: true })
                          : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded hover:bg-surface-tertiary text-muted hover:text-primary transition-colors">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirm === agent.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(agent.id)}
                                className="px-2 py-0.5 text-tiny rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-muted hover:text-primary"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(agent.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === "groups" ? (
        <div>
          {groups.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<FolderOpen className="w-6 h-6" />}
                title="No groups"
                description="Create agent groups to organize your data sources"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((group) => (
                <div key={group.id} className="card p-4 space-y-2">
                  <h4 className="text-h4 text-primary">{group.groupName}</h4>
                  <p className="text-small text-secondary">{group.groupDescription || "No description"}</p>
                  <div className="flex items-center gap-1 text-tiny text-muted">
                    <Server className="w-3 h-3" />
                    <span>{group.agentCount ?? 0} agents</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "collectors" ? (
        <div className="card overflow-hidden">
          {filteredCollectors.length === 0 ? (
            <EmptyState
              icon={<Radio className="w-6 h-6" />}
              title="No collectors found"
              description={searchQuery ? "No collectors match your search" : "Configure collectors to ingest data from network devices"}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCollectors.map((collector) => (
                    <tr key={collector.id} className="border-b border-surface-border hover:bg-surface-tertiary/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn(
                          "w-2.5 h-2.5 rounded-full inline-block",
                          isOnline(collector.lastSeen) ? "bg-green-500" : "bg-red-500"
                        )} />
                      </td>
                      <td className="px-4 py-3 text-body text-primary">{collector.hostname}</td>
                      <td className="px-4 py-3 text-small text-secondary">{collector.module || "—"}</td>
                      <td className="px-4 py-3 text-small text-muted">
                        {collector.lastSeen
                          ? formatDistanceToNow(new Date(collector.lastSeen), { addSuffix: true })
                          : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="No collector groups"
            description="Create collector groups to manage multiple collectors together"
          />
        </div>
      )}
    </div>
  );
}
