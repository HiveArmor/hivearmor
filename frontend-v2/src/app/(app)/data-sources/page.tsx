"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Trash2, Eye, MonitorCheck, MonitorX, Server, Users,
  FolderOpen, Radio, X, Workflow, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/toast";
import { CopyButton } from "@/components/ui/copy-button";
import { agentService } from "@/services/agent.service";
import type { Agent, AgentGroup, Collector } from "@/services/agent.service";
import { formatDistanceToNow } from "date-fns";

type Tab = "agents" | "groups" | "collectors" | "collector-groups" | "otelcol";

const OTEL_TEMPLATES: { label: string; filename: string; envVars: string[]; content: string }[] = [
  {
    label: "Windows Event Logs",
    filename: "windows.yaml",
    envVars: [],
    content: `receivers:
  windowseventlog:
    channel: System
    operators:
      - type: add
        field: attributes.data_type
        value: WINDOWS_AGENT
  windowseventlog/security:
    channel: Security
    operators:
      - type: add
        field: attributes.data_type
        value: WINDOWS_AGENT

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [windowseventlog, windowseventlog/security]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "Linux Syslog",
    filename: "linux-syslog.yaml",
    envVars: [],
    content: `receivers:
  filelog/syslog:
    include: ["/var/log/syslog", "/var/log/messages", "/var/log/auth.log"]
    start_at: end
    multiline:
      line_start_pattern: '^\\w{3}\\s+\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2}'
    operators:
      - type: add
        field: attributes.data_type
        value: LINUX_AGENT

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [filelog/syslog]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "Kubernetes Pod Logs",
    filename: "kubernetes.yaml",
    envVars: [],
    content: `receivers:
  k8s_events:
    namespaces: []
  filelog/k8s:
    include: ["/var/log/pods/*/*/*.log"]
    include_file_path: true
    start_at: end
    operators:
      - type: json_parser
        if: 'body matches "^{.*}$"'
      - type: add
        field: attributes.data_type
        value: KUBERNETES
      - type: move
        from: attributes["log.file.path"]
        to: resource["k8s.pod.log.path"]

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [k8s_events, filelog/k8s]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "AWS CloudTrail",
    filename: "aws-cloudtrail.yaml",
    envVars: ["AWS_REGION"],
    content: `receivers:
  awscloudwatch:
    region: \${AWS_REGION}
    logs:
      poll_interval: 1m
      groups:
        named:
          aws-cloudtrail-logs:
            names:
              - CloudTrail/management-events
    operators:
      - type: add
        field: attributes.data_type
        value: AWS

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [awscloudwatch]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "Azure Monitor",
    filename: "azure-monitor.yaml",
    envVars: ["AZURE_SUBSCRIPTION_ID"],
    content: `receivers:
  azuremonitor:
    subscription_id: \${AZURE_SUBSCRIPTION_ID}
    resource_groups: []
    services:
      - "Microsoft.Compute/virtualMachines"
      - "Microsoft.Network/networkSecurityGroups"
    operators:
      - type: add
        field: attributes.data_type
        value: AZURE

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [azuremonitor]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "Nginx Access Logs",
    filename: "nginx-access.yaml",
    envVars: [],
    content: `receivers:
  filelog/nginx:
    include: ["/var/log/nginx/access.log", "/var/log/nginx/error.log"]
    start_at: end
    operators:
      - type: regex_parser
        regex: '^(?P<remote_addr>\\S+) - (?P<remote_user>\\S+) \\[(?P<time_local>[^\\]]+)\\] "(?P<request>[^"]+)" (?P<status>\\d+) (?P<body_bytes_sent>\\d+)'
        if: 'body matches "^\\d"'
      - type: add
        field: attributes.data_type
        value: NGINX

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [filelog/nginx]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "Docker Containers",
    filename: "docker-containers.yaml",
    envVars: [],
    content: `receivers:
  filelog/docker:
    include: ["/var/lib/docker/containers/*/*-json.log"]
    include_file_path: true
    start_at: end
    operators:
      - type: json_parser
      - type: move
        from: attributes.log
        to: body
      - type: move
        from: attributes["log.file.path"]
        to: resource["container.log.path"]
      - type: add
        field: attributes.data_type
        value: GENERIC

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [filelog/docker]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "Palo Alto Networks",
    filename: "palo-alto.yaml",
    envVars: ["SYSLOG_UDP_PORT"],
    content: `receivers:
  udplog/pan:
    listen_address: "0.0.0.0:\${SYSLOG_UDP_PORT:-514}"
    operators:
      - type: regex_parser
        regex: '^<(?P<priority>\\d+)>(?P<timestamp>\\w{3}\\s+\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2})\\s+(?P<host>\\S+)\\s+(?P<message>.+)$'
      - type: add
        field: attributes.data_type
        value: PALO_ALTO_NETWORKS

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [udplog/pan]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "CrowdStrike Falcon",
    filename: "crowdstrike.yaml",
    envVars: ["AWS_REGION", "CROWDSTRIKE_FDR_BUCKET"],
    content: `receivers:
  awss3:
    s3downloader:
      region: \${AWS_REGION}
      s3_bucket: \${CROWDSTRIKE_FDR_BUCKET}
      s3_prefix: "data/"
    operators:
      - type: json_parser
      - type: add
        field: attributes.data_type
        value: CROWDSTRIKE_EDR

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [awss3]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
  {
    label: "GCP Cloud Logging",
    filename: "gcp-cloud-logging.yaml",
    envVars: ["GCP_PROJECT_ID", "GCP_PUBSUB_SUBSCRIPTION"],
    content: `receivers:
  googlecloudpubsub:
    project: \${GCP_PROJECT_ID}
    subscription: projects/\${GCP_PROJECT_ID}/subscriptions/\${GCP_PUBSUB_SUBSCRIPTION}
    encoding: raw_text
    operators:
      - type: json_parser
        if: 'body matches "^{.*}$"'
      - type: add
        field: attributes.data_type
        value: GCP

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/hivearmor:
    endpoint: \${HIVEARMOR_OTLP_ENDPOINT}
    tls:
      insecure: \${HIVEARMOR_INSECURE:-false}
    compression: none

service:
  pipelines:
    logs:
      receivers: [googlecloudpubsub]
      processors: [batch]
      exporters: [otlp/hivearmor]`,
  },
];

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
  const [otelTemplateIdx, setOtelTemplateIdx] = useState(0);
  const [otelDropdownOpen, setOtelDropdownOpen] = useState(false);

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
    { id: "otelcol", label: "OpenTelemetry Collector", icon: <Workflow className="w-3.5 h-3.5" /> },
  ];

  const selectedTemplate = OTEL_TEMPLATES[otelTemplateIdx];

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
      ) : tab === "otelcol" ? (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="text-h3 text-primary">Deploy with OTel Collector</h3>
              <p className="text-small text-secondary mt-1">
                Choose your log source type and copy the configuration. No HiveArmor agent required.
              </p>
            </div>

            {/* Source type selector */}
            <div className="space-y-1.5">
              <label className="text-tiny text-muted uppercase tracking-wider font-medium">Log source type</label>
              <div className="relative w-72">
                <button
                  onClick={() => setOtelDropdownOpen((v) => !v)}
                  className="input-base w-full flex items-center justify-between gap-2 text-left"
                >
                  <span className="text-small text-primary">{selectedTemplate.label}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted transition-transform", otelDropdownOpen && "rotate-180")} />
                </button>
                {otelDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-surface-border bg-surface-secondary shadow-lg py-1">
                    {OTEL_TEMPLATES.map((t, i) => (
                      <button
                        key={t.filename}
                        onClick={() => { setOtelTemplateIdx(i); setOtelDropdownOpen(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-small transition-colors",
                          i === otelTemplateIdx
                            ? "bg-brand/10 text-brand"
                            : "text-secondary hover:bg-surface-tertiary hover:text-primary"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Extra env vars notice */}
            {selectedTemplate.envVars.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-small text-amber-400">
                Also set:{" "}
                {selectedTemplate.envVars.map((v) => (
                  <code key={v} className="font-mono bg-amber-500/10 px-1 rounded mx-0.5">{v}</code>
                ))}
              </div>
            )}

            {/* YAML code block */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-tiny text-muted uppercase tracking-wider font-medium">
                  {selectedTemplate.filename}
                </span>
                <CopyButton value={selectedTemplate.content} />
              </div>
              <pre className="code-block overflow-auto max-h-96 text-tiny leading-relaxed whitespace-pre">
                {selectedTemplate.content}
              </pre>
            </div>

            {/* Run instructions */}
            <div className="space-y-2 border-t border-surface-border pt-4">
              <p className="text-small text-secondary font-medium">Required environment variables</p>
              <pre className="code-block text-tiny">
{`HIVEARMOR_OTLP_ENDPOINT=<your-server>:4317
HIVEARMOR_INSECURE=true  # set false in production`}
              </pre>
              <p className="text-small text-secondary font-medium mt-3">Run the collector</p>
              <pre className="code-block text-tiny">
{`otelcol --config ${selectedTemplate.filename}`}
              </pre>
            </div>
          </div>
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
