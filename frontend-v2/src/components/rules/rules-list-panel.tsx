"use client";

import { useState, useMemo, type ReactNode } from "react";
import {
  Search, Plus, Filter, ChevronDown,
  Activity, Shield, Bug, Eye, Lock, Server,
  AlertTriangle, Zap, Globe, ToggleLeft, ToggleRight,
  CheckCircle2, XCircle, Clock, Star, StarOff,
  Upload, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleSeverity  = "critical" | "high" | "medium" | "low" | "informational";
export type RuleStatus    = "enabled" | "disabled" | "testing";
export type RuleCategory  = "authentication" | "network" | "malware" | "lateral_movement" | "exfiltration" | "persistence" | "execution" | "discovery" | "collection" | "command_control";
export type RuleSource    = "custom" | "sigma" | "builtin" | "community";

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  status: RuleStatus;
  category: RuleCategory;
  source: RuleSource;
  mitreIds: string[];       // e.g. ["T1078", "T1110"]
  mitreTactics: string[];   // e.g. ["Initial Access", "Credential Access"]
  author: string;
  createdAt: string;
  updatedAt: string;
  alertCount: number;       // alerts triggered in last 30d
  falsePositives: number;
  favorited: boolean;
  logSources: string[];     // e.g. ["windows", "linux", "aws"]
  sigma?: string;           // YAML body
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const SIGMA_BRUTE: string = `title: Multiple Failed Login Attempts
id: a9e0f1c2-3b4d-5e6f-7a8b-9c0d1e2f3a4b
status: stable
description: Detects multiple failed authentication attempts from a single source
author: HiveArmor Labs
date: 2024/01/15
logsource:
  category: authentication
  product: windows
detection:
  selection:
    EventID: 4625
  timeframe: 5m
  condition: selection | count() by SourceAddress > 5
falsepositives:
  - Legitimate users entering wrong password
  - Password rotation scripts
level: high
tags:
  - attack.credential_access
  - attack.t1110
  - attack.t1110.001`;

const SIGMA_PSEXEC: string = `title: PsExec Remote Execution
id: b2f3a4e5-6c7d-8e9f-0a1b-2c3d4e5f6a7b
status: stable
description: Detects PsExec usage which may indicate lateral movement
author: HiveArmor Labs
date: 2024/02/01
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith:
      - '\\\\psexec.exe'
      - '\\\\psexesvc.exe'
  condition: selection
falsepositives:
  - Legitimate sysadmin activity
  - IT automation tools
level: high
tags:
  - attack.lateral_movement
  - attack.t1570`;

const SIGMA_LSASS: string = `title: LSASS Memory Dump
id: c3e4b5f6-7d8e-9f0a-1b2c-3d4e5f6a7b8c
status: stable
description: Detects LSASS process memory access — credential dumping
author: HiveArmor Labs
date: 2024/01/20
logsource:
  product: windows
  category: process_access
detection:
  selection:
    TargetImage|endswith: '\\\\lsass.exe'
    GrantedAccess:
      - '0x1010'
      - '0x1410'
      - '0x147a'
      - '0x1fffff'
  condition: selection
falsepositives:
  - Security software
  - Debuggers (dev environments)
level: critical
tags:
  - attack.credential_access
  - attack.t1003.001`;

export const DEMO_RULES: DetectionRule[] = [
  {
    id: "r001",
    name: "Multiple Failed Login Attempts",
    description: "Detects brute force attack — 5+ failed authentications from a single source within 5 minutes",
    severity: "high",
    status: "enabled",
    category: "authentication",
    source: "sigma",
    mitreIds: ["T1110", "T1110.001"],
    mitreTactics: ["Credential Access"],
    author: "HiveArmor Labs",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-03-01T08:30:00Z",
    alertCount: 143,
    falsePositives: 4,
    favorited: true,
    logSources: ["windows", "linux"],
    sigma: SIGMA_BRUTE,
  },
  {
    id: "r002",
    name: "PsExec Remote Execution Detected",
    description: "Detects the use of PsExec which is commonly leveraged for lateral movement",
    severity: "high",
    status: "enabled",
    category: "lateral_movement",
    source: "sigma",
    mitreIds: ["T1570"],
    mitreTactics: ["Lateral Movement"],
    author: "HiveArmor Labs",
    createdAt: "2024-02-01T10:00:00Z",
    updatedAt: "2024-02-28T12:00:00Z",
    alertCount: 27,
    falsePositives: 9,
    favorited: false,
    logSources: ["windows"],
    sigma: SIGMA_PSEXEC,
  },
  {
    id: "r003",
    name: "LSASS Memory Access",
    description: "Detects unauthorized access to LSASS process memory — potential credential dumping via Mimikatz",
    severity: "critical",
    status: "enabled",
    category: "malware",
    source: "builtin",
    mitreIds: ["T1003", "T1003.001"],
    mitreTactics: ["Credential Access"],
    author: "HiveArmor Labs",
    createdAt: "2024-01-10T10:00:00Z",
    updatedAt: "2024-04-01T09:00:00Z",
    alertCount: 8,
    falsePositives: 2,
    favorited: true,
    logSources: ["windows"],
    sigma: SIGMA_LSASS,
  },
  {
    id: "r004",
    name: "PowerShell Encoded Command Execution",
    description: "Detects PowerShell execution with encoded/obfuscated commands — common malware delivery technique",
    severity: "high",
    status: "enabled",
    category: "execution",
    source: "sigma",
    mitreIds: ["T1059.001"],
    mitreTactics: ["Execution"],
    author: "Community",
    createdAt: "2024-01-25T10:00:00Z",
    updatedAt: "2024-03-15T14:00:00Z",
    alertCount: 312,
    falsePositives: 67,
    favorited: false,
    logSources: ["windows"],
  },
  {
    id: "r005",
    name: "Suspicious DNS Tunneling",
    description: "Detects abnormally long DNS queries or high query frequency that may indicate data exfiltration via DNS",
    severity: "medium",
    status: "enabled",
    category: "exfiltration",
    source: "custom",
    mitreIds: ["T1048.001", "T1071.004"],
    mitreTactics: ["Exfiltration", "Command and Control"],
    author: "j.smith",
    createdAt: "2024-03-01T10:00:00Z",
    updatedAt: "2024-03-20T11:00:00Z",
    alertCount: 19,
    falsePositives: 3,
    favorited: false,
    logSources: ["dns", "network"],
  },
  {
    id: "r006",
    name: "Scheduled Task Creation",
    description: "Detects creation of scheduled tasks via schtasks.exe — common persistence mechanism",
    severity: "medium",
    status: "enabled",
    category: "persistence",
    source: "builtin",
    mitreIds: ["T1053.005"],
    mitreTactics: ["Persistence", "Privilege Escalation"],
    author: "HiveArmor Labs",
    createdAt: "2024-01-12T10:00:00Z",
    updatedAt: "2024-02-10T16:00:00Z",
    alertCount: 88,
    falsePositives: 41,
    favorited: false,
    logSources: ["windows"],
  },
  {
    id: "r007",
    name: "AWS CloudTrail: Root Account Usage",
    description: "Detects any API call made using the AWS root account — best practice is never to use root",
    severity: "high",
    status: "enabled",
    category: "authentication",
    source: "builtin",
    mitreIds: ["T1078.004"],
    mitreTactics: ["Initial Access", "Privilege Escalation"],
    author: "HiveArmor Labs",
    createdAt: "2024-02-15T10:00:00Z",
    updatedAt: "2024-02-15T10:00:00Z",
    alertCount: 3,
    falsePositives: 0,
    favorited: true,
    logSources: ["aws"],
  },
  {
    id: "r008",
    name: "Network Port Scan Detected",
    description: "Detects horizontal or vertical port scanning activity from a single host",
    severity: "medium",
    status: "testing",
    category: "discovery",
    source: "custom",
    mitreIds: ["T1046"],
    mitreTactics: ["Discovery"],
    author: "m.chen",
    createdAt: "2024-04-01T10:00:00Z",
    updatedAt: "2024-04-05T15:00:00Z",
    alertCount: 0,
    falsePositives: 0,
    favorited: false,
    logSources: ["network", "firewall"],
  },
  {
    id: "r009",
    name: "Data Staged in Temp Directory",
    description: "Detects large file write operations to temporary directories — potential data staging before exfiltration",
    severity: "medium",
    status: "enabled",
    category: "collection",
    source: "sigma",
    mitreIds: ["T1074.001"],
    mitreTactics: ["Collection"],
    author: "Community",
    createdAt: "2024-02-20T10:00:00Z",
    updatedAt: "2024-03-10T13:00:00Z",
    alertCount: 34,
    falsePositives: 15,
    favorited: false,
    logSources: ["windows", "linux"],
  },
  {
    id: "r010",
    name: "Suspicious Outbound HTTPS to New Domain",
    description: "Detects new domain HTTPS connections not seen in last 30 days — possible C2 beaconing",
    severity: "low",
    status: "enabled",
    category: "command_control",
    source: "custom",
    mitreIds: ["T1071.001", "T1568"],
    mitreTactics: ["Command and Control"],
    author: "a.jones",
    createdAt: "2024-03-10T10:00:00Z",
    updatedAt: "2024-03-25T11:00:00Z",
    alertCount: 205,
    falsePositives: 198,
    favorited: false,
    logSources: ["proxy", "network"],
  },
  {
    id: "r011",
    name: "Linux Cron Persistence",
    description: "Detects modifications to cron files that may indicate persistence via scheduled tasks",
    severity: "medium",
    status: "disabled",
    category: "persistence",
    source: "sigma",
    mitreIds: ["T1053.003"],
    mitreTactics: ["Persistence"],
    author: "HiveArmor Labs",
    createdAt: "2024-01-30T10:00:00Z",
    updatedAt: "2024-02-05T09:00:00Z",
    alertCount: 0,
    falsePositives: 0,
    favorited: false,
    logSources: ["linux"],
  },
  {
    id: "r012",
    name: "Kubernetes API Anomaly",
    description: "Detects unusual kubectl exec or privileged pod creation in Kubernetes clusters",
    severity: "critical",
    status: "enabled",
    category: "execution",
    source: "custom",
    mitreIds: ["T1610", "T1609"],
    mitreTactics: ["Execution"],
    author: "j.smith",
    createdAt: "2024-04-10T10:00:00Z",
    updatedAt: "2024-04-10T10:00:00Z",
    alertCount: 5,
    falsePositives: 1,
    favorited: true,
    logSources: ["kubernetes"],
  },
];

// ── Metadata maps ─────────────────────────────────────────────────────────────

export const SEV_META: Record<RuleSeverity, { label: string; color: string; dot: string }> = {
  critical:      { label: "Critical",      color: "text-critical",    dot: "bg-critical" },
  high:          { label: "High",          color: "text-high",        dot: "bg-high" },
  medium:        { label: "Medium",        color: "text-medium",      dot: "bg-medium" },
  low:           { label: "Low",           color: "text-low",         dot: "bg-low" },
  informational: { label: "Info",          color: "text-muted",       dot: "bg-muted" },
};

export const STATUS_META: Record<RuleStatus, { icon: ReactNode; label: string; color: string }> = {
  enabled:  { icon: <CheckCircle2 className="w-3 h-3" />, label: "Enabled",  color: "text-success" },
  disabled: { icon: <XCircle className="w-3 h-3" />,      label: "Disabled", color: "text-muted" },
  testing:  { icon: <Clock className="w-3 h-3" />,         label: "Testing",  color: "text-warning" },
};

const CAT_META: Record<RuleCategory, { label: string; icon: ReactNode }> = {
  authentication:   { label: "Authentication",  icon: <Lock className="w-3 h-3" /> },
  network:          { label: "Network",         icon: <Globe className="w-3 h-3" /> },
  malware:          { label: "Malware",         icon: <Bug className="w-3 h-3" /> },
  lateral_movement: { label: "Lateral Move",    icon: <Activity className="w-3 h-3" /> },
  exfiltration:     { label: "Exfiltration",    icon: <Download className="w-3 h-3" /> },
  persistence:      { label: "Persistence",     icon: <Server className="w-3 h-3" /> },
  execution:        { label: "Execution",       icon: <Zap className="w-3 h-3" /> },
  discovery:        { label: "Discovery",       icon: <Eye className="w-3 h-3" /> },
  collection:       { label: "Collection",      icon: <Shield className="w-3 h-3" /> },
  command_control:  { label: "C2",              icon: <AlertTriangle className="w-3 h-3" /> },
};

// ── Source badges ─────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<RuleSource, { label: string; className: string }> = {
  custom:    { label: "Custom",    className: "bg-brand/10 text-brand" },
  sigma:     { label: "Sigma",     className: "bg-purple-500/10 text-purple-400" },
  builtin:   { label: "Built-in",  className: "bg-surface-tertiary text-secondary" },
  community: { label: "Community", className: "bg-cyan-500/10 text-cyan-400" },
};

// ── Rule card ─────────────────────────────────────────────────────────────────

interface RuleCardProps {
  rule: DetectionRule;
  selected: boolean;
  onSelect: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onFavorite: (id: string) => void;
}

function RuleCard({ rule, selected, onSelect, onToggle, onFavorite }: RuleCardProps) {
  const sev = SEV_META[rule.severity] ?? { label: rule.severity ?? "unknown", color: "text-muted" };
  const st  = STATUS_META[rule.status] ?? { label: rule.status ?? "unknown", color: "text-muted", icon: null };
  const src = SOURCE_BADGE[rule.source as RuleSource] ?? { label: rule.source ?? "unknown", className: "bg-surface-tertiary text-secondary" };
  const cat = CAT_META[rule.category as RuleCategory] ?? { label: rule.category ?? "Unknown", icon: null };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "px-3 py-3 cursor-pointer border-b border-surface-border/50 transition-colors group",
        selected ? "bg-brand/8 border-l-2 border-l-brand" : "hover:bg-surface-tertiary/40 border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Severity dot */}
        <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", sev.dot)} />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start gap-1.5 justify-between">
            <p className="text-small font-medium text-primary leading-snug line-clamp-1 flex-1">{rule.name}</p>
            <button
              onClick={(e) => { e.stopPropagation(); onFavorite(rule.id); }}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {rule.favorited
                ? <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                : <StarOff className="w-3.5 h-3.5 text-muted" />
              }
            </button>
          </div>

          {/* Description */}
          <p className="text-tiny text-muted line-clamp-1 mt-0.5">{rule.description}</p>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn("flex items-center gap-1 text-tiny font-medium", sev.color)}>{sev.label}</span>
            <span className="text-surface-border">·</span>
            <span className={cn("flex items-center gap-0.5 text-tiny", st.color)}>{st.icon}{st.label}</span>
            <span className="text-surface-border">·</span>
            <span className="flex items-center gap-1 text-tiny text-muted">{cat.icon}{cat.label}</span>
          </div>

          {/* Bottom row: source badge + alert count + toggle */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn("px-1.5 py-0.5 rounded text-tiny font-medium", src.className)}>{src.label}</span>
            {rule.alertCount > 0 && (
              <span className="text-tiny text-muted">{rule.alertCount.toLocaleString()} alerts/30d</span>
            )}
            <div className="ml-auto">
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(rule.id, rule.status !== "enabled"); }}
                title={rule.status === "enabled" ? "Disable rule" : "Enable rule"}
              >
                {rule.status === "enabled"
                  ? <ToggleRight className="w-5 h-5 text-success" />
                  : <ToggleLeft className="w-5 h-5 text-muted" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface RulesListPanelProps {
  rules?: DetectionRule[];
  selectedId: string | null;
  onSelect: (rule: DetectionRule) => void;
  onNewRule: () => void;
  onImport: () => void;
}

type SortKey = "name" | "severity" | "alertCount" | "updatedAt";

const SEV_ORDER: Record<RuleSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 };

export function RulesListPanel({
  rules = DEMO_RULES,
  selectedId,
  onSelect,
  onNewRule,
  onImport,
}: RulesListPanelProps) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<RuleSeverity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<RuleStatus | "all">("all");
  const [catFilter] = useState<RuleCategory | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDesc, setSortDesc] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [localRules, setLocalRules] = useState<DetectionRule[]>(rules);

  const handleToggle = (id: string, enable: boolean) => {
    setLocalRules((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: enable ? "enabled" : "disabled" } : r)
    );
  };

  const handleFavorite = (id: string) => {
    setLocalRules((prev) => prev.map((r) => r.id === id ? { ...r, favorited: !r.favorited } : r));
  };

  const filtered = useMemo(() => {
    let out = localRules.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (severityFilter !== "all" && r.severity !== severityFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (catFilter !== "all" && r.category !== catFilter) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      let diff = 0;
      if (sortKey === "severity")    diff = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      else if (sortKey === "alertCount") diff = a.alertCount - b.alertCount;
      else if (sortKey === "name")       diff = a.name.localeCompare(b.name);
      else if (sortKey === "updatedAt")  diff = a.updatedAt.localeCompare(b.updatedAt);
      return sortDesc ? -diff : diff;
    });

    return out;
  }, [localRules, search, severityFilter, statusFilter, catFilter, sortKey, sortDesc]);

  const stats = useMemo(() => ({
    total:    localRules.length,
    enabled:  localRules.filter((r) => r.status === "enabled").length,
    critical: localRules.filter((r) => r.severity === "critical").length,
    testing:  localRules.filter((r) => r.status === "testing").length,
  }), [localRules]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  return (
    <div className="flex flex-col h-full border-r border-surface-border">
      {/* Header */}
      <div className="px-3 py-3 border-b border-surface-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-h4 font-bold text-primary">Detection Rules</h2>
          <div className="flex items-center gap-1">
            <button onClick={onImport} className="toolbar-btn" title="Import rules">
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button onClick={onNewRule} className="btn btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-tiny text-muted mb-2">
          <span className="text-primary font-medium">{stats.total}</span> rules ·
          <span className="text-success">{stats.enabled}</span> enabled ·
          {stats.critical > 0 && <><span className="text-critical">{stats.critical}</span> critical ·</>}
          {stats.testing > 0  && <><span className="text-warning">{stats.testing}</span> testing</>}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="input-base w-full pl-8 py-1.5 text-small"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn("flex items-center gap-1.5 text-tiny transition-colors", showFilters ? "text-brand" : "text-muted hover:text-secondary")}
        >
          <Filter className="w-3 h-3" /> Filters
          <ChevronDown className={cn("w-3 h-3 transition-transform", showFilters && "rotate-180")} />
        </button>

        {showFilters && (
          <div className="mt-2 space-y-2">
            {/* Severity */}
            <div>
              <p className="text-tiny text-muted mb-1">Severity</p>
              <div className="flex flex-wrap gap-1">
                {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverityFilter(s)}
                    className={cn(
                      "px-2 py-0.5 rounded text-tiny capitalize border transition-colors",
                      severityFilter === s
                        ? s === "all" ? "bg-brand/15 text-brand border-brand/25"
                          : s === "critical" ? "bg-critical/15 text-critical border-critical/25"
                          : s === "high" ? "bg-high/15 text-high border-high/25"
                          : s === "medium" ? "bg-medium/15 text-medium border-medium/25"
                          : "bg-low/15 text-low border-low/25"
                        : "text-muted border-surface-border hover:bg-surface-tertiary"
                    )}
                  >{s === "all" ? "All" : s}</button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-tiny text-muted mb-1">Status</p>
              <div className="flex gap-1">
                {(["all", "enabled", "disabled", "testing"] as const).map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={cn("px-2 py-0.5 rounded text-tiny capitalize border transition-colors",
                      statusFilter === s ? "bg-brand/15 text-brand border-brand/25" : "text-muted border-surface-border hover:bg-surface-tertiary"
                    )}>{s === "all" ? "All" : s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sort bar */}
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-surface-border/50">
          <span className="text-tiny text-muted mr-1">Sort:</span>
          {([["severity", "Severity"], ["alertCount", "Alerts"], ["updatedAt", "Updated"]] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => toggleSort(key)}
              className={cn("px-2 py-0.5 rounded text-tiny transition-colors",
                sortKey === key ? "text-brand" : "text-muted hover:text-secondary"
              )}
            >
              {label} {sortKey === key ? (sortDesc ? "↓" : "↑") : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Rule list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Shield className="w-6 h-6 text-muted" />
            <p className="text-small text-muted">No rules match filters</p>
          </div>
        ) : (
          filtered.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              selected={selectedId === rule.id}
              onSelect={() => onSelect(rule)}
              onToggle={handleToggle}
              onFavorite={handleFavorite}
            />
          ))
        )}
      </div>
    </div>
  );
}
