"use client";

import { useState } from "react";
import {
  ChevronLeft, Shield, User, Clock, AlertTriangle,
  CheckCircle2, Zap, Plus, MoreHorizontal, Tag,
  FileText, Edit3, X, Brain, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "in_progress" | "contained" | "resolved" | "closed";

export interface InvestigationIncident {
  id: string;
  name: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assignee?: string;
  alertCount: number;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  mitreTactics: string[];
}

const SEV_META: Record<IncidentSeverity, { label: string; color: string; dot: string }> = {
  critical: { label: "Critical", color: "text-critical",   dot: "bg-critical shadow-[0_0_6px_var(--color-critical)]" },
  high:     { label: "High",     color: "text-high",       dot: "bg-high shadow-[0_0_6px_var(--color-high)]" },
  medium:   { label: "Medium",   color: "text-medium",     dot: "bg-medium" },
  low:      { label: "Low",      color: "text-low",        dot: "bg-low" },
};

const STATUS_META: Record<IncidentStatus, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: "Open",        color: "text-critical",     icon: <AlertTriangle className="w-3 h-3" /> },
  in_progress: { label: "In Progress", color: "text-warning",      icon: <Clock className="w-3 h-3" /> },
  contained:   { label: "Contained",   color: "text-brand-accent", icon: <Shield className="w-3 h-3" /> },
  resolved:    { label: "Resolved",    color: "text-success",      icon: <CheckCircle2 className="w-3 h-3" /> },
  closed:      { label: "Closed",      color: "text-muted",        icon: <X className="w-3 h-3" /> },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface InvestigationHeaderProps {
  incident: InvestigationIncident;
  onStatusChange?: (s: IncidentStatus) => void;
  onAddEvidence?: () => void;
  onLaunchSoar?: () => void;
  onAddNote?: () => void;
  onGenerateSummary?: () => void;
  onViewLogs?: () => void;
}

export function InvestigationHeader({
  incident,
  onStatusChange,
  onAddEvidence,
  onLaunchSoar,
  onAddNote,
  onGenerateSummary,
  onViewLogs,
}: InvestigationHeaderProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(incident.name);
  const sev = SEV_META[incident.severity];
  const status = STATUS_META[incident.status];

  return (
    <div className="bg-surface-primary border-b border-surface-border px-4 py-3 space-y-2.5 shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-tiny">
        <Link href="/incidents" className="flex items-center gap-1 text-muted hover:text-brand transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
          Incidents
        </Link>
        <span className="text-surface-border">/</span>
        <span className="text-secondary">#{incident.id.slice(-6).toUpperCase()}</span>
      </div>

      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", sev.dot)} />

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingName(false); }}
              className="input-base w-full max-w-xl text-h2 font-bold"
            />
          ) : (
            <button
              className="flex items-center gap-2 group text-left"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              <h1 className="text-h2 font-bold text-primary leading-tight">{incident.name}</h1>
              <Edit3 className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
            </button>
          )}

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5">
            {/* Severity */}
            <span className={cn("flex items-center gap-1 text-small font-medium", sev.color)}>
              <Shield className="w-3 h-3" /> {sev.label}
            </span>

            {/* Status dropdown */}
            <div className="relative">
              <button
                onClick={() => setStatusOpen(!statusOpen)}
                className={cn(
                  "flex items-center gap-1.5 text-small font-medium transition-colors",
                  status.color,
                  "hover:opacity-80"
                )}
              >
                {status.icon} {status.label}
              </button>
              {statusOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 card shadow-dropdown py-1 w-40 animate-scale-in">
                    {(Object.entries(STATUS_META) as [IncidentStatus, typeof STATUS_META[IncidentStatus]][]).map(([key, m]) => (
                      <button
                        key={key}
                        onClick={() => { onStatusChange?.(key); setStatusOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-small transition-colors",
                          incident.status === key
                            ? "bg-brand-subtle text-brand"
                            : "text-secondary hover:bg-surface-tertiary"
                        )}
                      >
                        <span className={m.color}>{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Assignee */}
            {incident.assignee && (
              <span className="flex items-center gap-1 text-small text-secondary">
                <User className="w-3 h-3 text-muted" /> {incident.assignee}
              </span>
            )}

            {/* Alert count */}
            <span className="flex items-center gap-1 text-small text-secondary">
              <AlertTriangle className="w-3 h-3 text-muted" />
              {incident.alertCount} alert{incident.alertCount !== 1 ? "s" : ""}
            </span>

            {/* Time */}
            <span className="flex items-center gap-1 text-small text-muted">
              <Clock className="w-3 h-3" /> {timeAgo(incident.createdAt)}
            </span>
          </div>

          {/* Tags + MITRE tactics */}
          {(incident.tags.length > 0 || incident.mitreTactics.length > 0) && (
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              {incident.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny bg-surface-tertiary text-secondary border border-surface-border">
                  <Tag className="w-2.5 h-2.5" /> {t}
                </span>
              ))}
              {incident.mitreTactics.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full text-tiny bg-brand/10 text-brand border border-brand/20">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <button
            onClick={onViewLogs}
            className="btn btn-sm btn-secondary gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View in Logs
          </button>
          <button
            onClick={onGenerateSummary}
            className="btn btn-sm btn-secondary gap-1.5"
          >
            <Brain className="w-3.5 h-3.5" /> Summary
          </button>
          <button
            onClick={onAddNote}
            className="btn btn-sm btn-secondary gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> Note
          </button>
          <button
            onClick={onAddEvidence}
            className="btn btn-sm btn-secondary gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Evidence
          </button>
          <button
            onClick={onLaunchSoar}
            className="btn btn-sm btn-primary gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> SOAR
          </button>
          <button className="toolbar-btn">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
