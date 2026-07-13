"use client";

import { useState, type ReactNode } from "react";
import {
  Shield, Globe, Zap, Search, LayoutTemplate,
  ChevronRight, Clock, GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybookNodeData, NodeKind } from "./playbook-nodes";
import type { Node, Edge } from "@xyflow/react";

export interface PlaybookTemplate {
  id: string;
  name: string;
  category: "containment" | "enrichment" | "notification" | "investigation" | "remediation";
  description: string;
  steps: number;
  estimatedTime: string;
  nodes: Node<PlaybookNodeData>[];
  edges: Edge[];
}

const CAT_META: Record<string, { color: string; icon: ReactNode }> = {
  containment:   { color: "text-critical",      icon: <Shield className="w-3.5 h-3.5" /> },
  enrichment:    { color: "text-brand-accent",  icon: <Globe className="w-3.5 h-3.5" /> },
  notification:  { color: "text-brand",         icon: <Zap className="w-3.5 h-3.5" /> },
  investigation: { color: "text-warning",       icon: <Search className="w-3.5 h-3.5" /> },
  remediation:   { color: "text-success",       icon: <GitBranch className="w-3.5 h-3.5" /> },
};

function makeNode(id: string, kind: NodeKind, label: string, sublabel: string, x: number, y: number, extra: Partial<PlaybookNodeData> = {}): Node<PlaybookNodeData> {
  return { id, type: kind, position: { x, y }, data: { kind, label, sublabel, status: "idle", ...extra } };
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string): Edge {
  return { id, source, target, sourceHandle, animated: true, style: { stroke: "var(--brand-primary)", strokeWidth: 1.5 } };
}

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    id: "tpl-brute-force",
    name: "Brute Force Response",
    category: "containment",
    description: "Detect brute force, enrich attacker IP, block at firewall, notify SOC.",
    steps: 5,
    estimatedTime: "~2 min",
    nodes: [
      makeNode("t1", "trigger",   "Alert Received",    "alert.created",                     200, 0,   { triggerType: "alert.created" }),
      makeNode("c1", "condition", "Severity ≥ High?",  "severity >= 7",                     200, 120, { conditionField: "alert.severity", conditionOp: ">=", conditionValue: "7" }),
      makeNode("a1", "action",    "Enrich Attacker IP","Threat Intel → query_ip",           340, 260, { actionIntegration: "threat-intel", actionName: "query_ip" }),
      makeNode("a2", "action",    "Block IP",          "Firewall → block_ip",               200, 400, { actionIntegration: "firewall", actionName: "block_ip" }),
      makeNode("a3", "action",    "Notify SOC",        "Messaging → send_message",          200, 520, { actionIntegration: "messaging", actionName: "send_message" }),
    ],
    edges: [
      makeEdge("e1", "t1", "c1"),
      makeEdge("e2", "c1", "a1", "true"),
      makeEdge("e3", "a1", "a2"),
      makeEdge("e4", "a2", "a3"),
    ],
  },
  {
    id: "tpl-malware-response",
    name: "Malware Containment",
    category: "containment",
    description: "Isolate infected host, collect forensics, create incident ticket.",
    steps: 6,
    estimatedTime: "~5 min",
    nodes: [
      makeNode("t1", "trigger",   "Malware Alert",      "alert.created",                 200, 0,   { triggerType: "alert.created" }),
      makeNode("c1", "condition", "Ransomware?",        'category == "malware"',         200, 120, { conditionField: "alert.category", conditionOp: "==", conditionValue: "malware" }),
      makeNode("a1", "action",    "Isolate Host",       "EDR → isolate_host",            200, 260, { actionIntegration: "edr", actionName: "isolate_host" }),
      makeNode("a2", "action",    "Collect Forensics",  "EDR → run_scan",                200, 380, { actionIntegration: "edr", actionName: "run_scan" }),
      makeNode("a3", "action",    "Create Ticket",      "Ticketing → create_ticket",     200, 500, { actionIntegration: "ticketing", actionName: "create_ticket" }),
      makeNode("a4", "action",    "Alert SOC",          "Email → send_email",            200, 620, { actionIntegration: "email", actionName: "send_email" }),
    ],
    edges: [
      makeEdge("e1", "t1", "c1"),
      makeEdge("e2", "c1", "a1", "true"),
      makeEdge("e3", "a1", "a2"),
      makeEdge("e4", "a2", "a3"),
      makeEdge("e5", "a3", "a4"),
    ],
  },
  {
    id: "tpl-enrich-ioc",
    name: "IOC Enrichment",
    category: "enrichment",
    description: "Query VT, Shodan, and WHOIS for all IOCs and attach results to the alert.",
    steps: 4,
    estimatedTime: "~3 min",
    nodes: [
      makeNode("t1", "trigger",   "New Alert",          "alert.created",                 200, 0,   { triggerType: "alert.created" }),
      makeNode("a1", "action",    "Query VT",           "Threat Intel → query_ip",       100, 120, { actionIntegration: "threat-intel", actionName: "query_ip" }),
      makeNode("a2", "action",    "Query Shodan",       "Threat Intel → query_domain",   300, 120, { actionIntegration: "threat-intel", actionName: "query_domain" }),
      makeNode("a3", "action",    "Tag Alert",          "SIEM → tag_alert",              200, 260, { actionIntegration: "siem", actionName: "tag_alert" }),
    ],
    edges: [
      makeEdge("e1", "t1", "a1"),
      makeEdge("e2", "t1", "a2"),
      makeEdge("e3", "a1", "a3"),
      makeEdge("e4", "a2", "a3"),
    ],
  },
  {
    id: "tpl-ai-triage",
    name: "AI Triage & Classification",
    category: "investigation",
    description: "Use AI to classify alert severity, suggest next steps, auto-assign priority.",
    steps: 4,
    estimatedTime: "~1 min",
    nodes: [
      makeNode("t1", "trigger",   "Alert Created",      "alert.created",                 200, 0,   { triggerType: "alert.created" }),
      makeNode("ai1", "ai",       "AI Triage",          "claude-sonnet-5",               200, 120, { aiModel: "claude-sonnet-5", aiPrompt: "Analyze this alert: {{alert | json}}\n\nClassify as: critical/high/medium/low\nProvide: reasoning, suggested_action", aiOutputVar: "triage" }),
      makeNode("c1", "condition", "Critical?",          "triage.severity == critical",   200, 260, { conditionField: "triage.severity", conditionOp: "==", conditionValue: "critical" }),
      makeNode("a1", "action",    "Escalate",           "Messaging → send_message",      200, 400, { actionIntegration: "messaging", actionName: "send_message" }),
    ],
    edges: [
      makeEdge("e1", "t1", "ai1"),
      makeEdge("e2", "ai1", "c1"),
      makeEdge("e3", "c1", "a1", "true"),
    ],
  },
  {
    id: "tpl-user-compromise",
    name: "Compromised User Response",
    category: "containment",
    description: "Disable account, revoke sessions, force password reset, notify user manager.",
    steps: 5,
    estimatedTime: "~2 min",
    nodes: [
      makeNode("t1", "trigger",   "Credential Alert",   "alert.created",                 200, 0,   { triggerType: "alert.created" }),
      makeNode("a1", "action",    "Disable User",       "AD → disable_user",             200, 120, { actionIntegration: "ad", actionName: "disable_user" }),
      makeNode("a2", "action",    "Reset Password",     "AD → reset_password",           200, 240, { actionIntegration: "ad", actionName: "reset_password" }),
      makeNode("a3", "action",    "Create Ticket",      "Ticketing → create_ticket",     200, 360, { actionIntegration: "ticketing", actionName: "create_ticket" }),
      makeNode("a4", "action",    "Email Manager",      "Email → send_email",            200, 480, { actionIntegration: "email", actionName: "send_email" }),
    ],
    edges: [
      makeEdge("e1", "t1", "a1"),
      makeEdge("e2", "a1", "a2"),
      makeEdge("e3", "a2", "a3"),
      makeEdge("e4", "a3", "a4"),
    ],
  },
  {
    id: "tpl-scheduled-hunt",
    name: "Scheduled Threat Hunt",
    category: "investigation",
    description: "Runs on a cron schedule — queries SIEM for IOCs and creates alert if found.",
    steps: 4,
    estimatedTime: "~10 min",
    nodes: [
      makeNode("t1", "trigger",   "Daily Schedule",     "schedule.cron: 0 6 * * *",      200, 0,   { triggerType: "schedule.cron" }),
      makeNode("a1", "action",    "Query SIEM",         "SIEM → create_log_entry",       200, 120, { actionIntegration: "siem", actionName: "create_log_entry" }),
      makeNode("c1", "condition", "IOC Found?",         "result.count > 0",              200, 240, { conditionField: "result.count", conditionOp: ">", conditionValue: "0" }),
      makeNode("a2", "action",    "Create Alert",       "SIEM → enrich_alert",           200, 380, { actionIntegration: "siem", actionName: "enrich_alert" }),
    ],
    edges: [
      makeEdge("e1", "t1", "a1"),
      makeEdge("e2", "a1", "c1"),
      makeEdge("e3", "c1", "a2", "true"),
    ],
  },
  {
    id: "tpl-phishing",
    name: "Phishing Email Response",
    category: "remediation",
    description: "Block sender domain, quarantine emails, notify affected users, create incident.",
    steps: 5,
    estimatedTime: "~3 min",
    nodes: [
      makeNode("t1", "trigger",   "Phishing Alert",     "alert.created",                 200, 0,   { triggerType: "alert.created" }),
      makeNode("a1", "action",    "Block Domain",       "Firewall → create_acl_rule",    200, 120, { actionIntegration: "firewall", actionName: "create_acl_rule" }),
      makeNode("a2", "action",    "Enrich Domain",      "Threat Intel → query_domain",   200, 240, { actionIntegration: "threat-intel", actionName: "query_domain" }),
      makeNode("a3", "action",    "Notify Users",       "Email → send_email",            200, 360, { actionIntegration: "email", actionName: "send_email" }),
      makeNode("a4", "action",    "Create Incident",    "Ticketing → create_ticket",     200, 480, { actionIntegration: "ticketing", actionName: "create_ticket" }),
    ],
    edges: [
      makeEdge("e1", "t1", "a1"),
      makeEdge("e2", "a1", "a2"),
      makeEdge("e3", "a2", "a3"),
      makeEdge("e4", "a3", "a4"),
    ],
  },
  {
    id: "tpl-lateral-movement",
    name: "Lateral Movement Containment",
    category: "containment",
    description: "Detect WMI/PsExec lateral movement, isolate source & target hosts.",
    steps: 6,
    estimatedTime: "~4 min",
    nodes: [
      makeNode("t1", "trigger",   "LM Alert",           "alert.created",                 200, 0,   { triggerType: "alert.created" }),
      makeNode("ai1", "ai",       "AI Context",         "claude-sonnet-5",               200, 120, { aiModel: "claude-sonnet-5", aiPrompt: "Identify all hosts involved in lateral movement from: {{alert | json}}" }),
      makeNode("a1", "action",    "Isolate Source",     "EDR → isolate_host",            100, 260, { actionIntegration: "edr", actionName: "isolate_host" }),
      makeNode("a2", "action",    "Isolate Target",     "EDR → isolate_host",            300, 260, { actionIntegration: "edr", actionName: "isolate_host" }),
      makeNode("a3", "action",    "Kill Processes",     "EDR → kill_process",            200, 400, { actionIntegration: "edr", actionName: "kill_process" }),
      makeNode("a4", "action",    "Create Ticket",      "Ticketing → create_ticket",     200, 520, { actionIntegration: "ticketing", actionName: "create_ticket" }),
    ],
    edges: [
      makeEdge("e1", "t1", "ai1"),
      makeEdge("e2", "ai1", "a1"),
      makeEdge("e3", "ai1", "a2"),
      makeEdge("e4", "a1", "a3"),
      makeEdge("e5", "a2", "a3"),
      makeEdge("e6", "a3", "a4"),
    ],
  },
];

interface PlaybookTemplateLibraryProps {
  onLoad: (template: PlaybookTemplate) => void;
  className?: string;
}

export function PlaybookTemplateLibrary({ onLoad, className }: PlaybookTemplateLibraryProps) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const filtered = PLAYBOOK_TEMPLATES.filter((t) => {
    if (catFilter !== "all" && t.category !== catFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-surface-primary border-r border-surface-border", className)}>
      {/* Header */}
      <div className="px-3 py-3 border-b border-surface-border shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4 text-brand" />
          <h3 className="text-small font-semibold text-primary">Templates</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base w-full pl-8 text-small py-1.5"
          />
        </div>
        {/* Category chips */}
        <div className="flex gap-1 flex-wrap">
          {["all", ...Object.keys(CAT_META)].map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={cn(
                "px-2 py-0.5 rounded text-tiny capitalize transition-colors",
                catFilter === cat
                  ? "bg-brand-subtle text-brand"
                  : "text-muted hover:text-secondary hover:bg-surface-tertiary"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.map((t) => {
          const cat = CAT_META[t.category];
          return (
            <button
              key={t.id}
              onClick={() => onLoad(t)}
              className="w-full text-left rounded-lg border border-surface-border bg-surface-secondary hover:border-surface-border-focus hover:bg-surface-elevated transition-all p-3 group"
            >
              <div className="flex items-start gap-2">
                <span className={cn("shrink-0 mt-0.5", cat.color)}>{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 justify-between">
                    <p className="text-small font-medium text-primary leading-tight">{t.name}</p>
                    <ChevronRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                  </div>
                  <p className="text-tiny text-muted mt-0.5 line-clamp-2">{t.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-tiny text-muted flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {t.estimatedTime}
                    </span>
                    <span className="text-tiny text-muted">{t.steps} steps</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
