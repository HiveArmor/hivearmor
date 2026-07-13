"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, AlertTriangle, Search, Shield, Network,
  Settings, Crosshair, BookOpen, Database, BarChart3, Puzzle,
  Siren, Users, Zap, Bell, GitBranch, Activity,
  ArrowRight,
} from "lucide-react";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  href: string;
  group: string;
  keywords?: string[];
}

const COMMANDS: Command[] = [
  // ── Investigate
  { id: "dashboard",       label: "Security Posture",           icon: <LayoutDashboard className="w-4 h-4" />, href: "/dashboard",                  group: "Investigate", keywords: ["home", "overview", "soc", "posture"] },
  { id: "alerts",          label: "Alerts",                     icon: <AlertTriangle className="w-4 h-4" />,  href: "/alerts",                     group: "Investigate", keywords: ["threats", "events"] },
  { id: "logs",            label: "Log Explorer",               icon: <Search className="w-4 h-4" />,          href: "/logs",                       group: "Investigate", keywords: ["search", "query", "kql", "spl"] },
  { id: "incidents",       label: "Incidents",                  icon: <Siren className="w-4 h-4" />,           href: "/incidents",                  group: "Investigate", keywords: ["cases", "triage"] },
  { id: "cases",           label: "Cases",                      icon: <Shield className="w-4 h-4" />,          href: "/offenses",                   group: "Investigate", keywords: ["offenses", "cases"] },
  { id: "adversary-hunt",  label: "Adversary Hunt",             icon: <Crosshair className="w-4 h-4" />,       href: "/alerts/adversary",           group: "Investigate", keywords: ["adversary", "hunt", "threat hunting"] },
  { id: "threat-activity", label: "Threat Activity",            icon: <Activity className="w-4 h-4" />,        href: "/dashboard/threat-activity",  group: "Investigate", keywords: ["activity", "trends"] },
  // ── Detection
  { id: "threat-intel",    label: "Threat Intelligence",        icon: <Crosshair className="w-4 h-4" />,       href: "/threat-intel",               group: "Detection",   keywords: ["ioc", "feeds", "intel"] },
  { id: "rules",           label: "Detection Rules",            icon: <Shield className="w-4 h-4" />,          href: "/rules",                      group: "Detection",   keywords: ["correlation", "sigma", "detection"] },
  { id: "attck",           label: "ATT&CK Coverage",            icon: <Network className="w-4 h-4" />,         href: "/rules/coverage",             group: "Detection",   keywords: ["mitre", "attck", "coverage"] },
  { id: "uba",             label: "User Behavior Analytics",    icon: <Users className="w-4 h-4" />,           href: "/uba",                        group: "Detection",   keywords: ["ueba", "anomaly", "behavioral"] },
  // ── Respond
  { id: "soar",            label: "Playbooks",                  icon: <GitBranch className="w-4 h-4" />,       href: "/soar",                       group: "Respond",     keywords: ["automation", "playbook", "flows", "soar"] },
  { id: "soar-flows",      label: "Flow Builder",               icon: <Zap className="w-4 h-4" />,             href: "/soar/flows",                 group: "Respond",     keywords: ["flow", "builder", "automation"] },
  { id: "soar-console",    label: "SOAR Console",               icon: <Activity className="w-4 h-4" />,        href: "/soar/console",               group: "Respond",     keywords: ["terminal", "execute", "console"] },
  // ── Compliance
  { id: "compliance",      label: "Compliance Frameworks",      icon: <BookOpen className="w-4 h-4" />,        href: "/compliance",                 group: "Compliance",  keywords: ["hipaa", "pci", "cis", "frameworks"] },
  { id: "reports",         label: "Reports",                    icon: <BarChart3 className="w-4 h-4" />,       href: "/reports",                    group: "Compliance",  keywords: ["report", "export"] },
  // ── Content Studio
  { id: "dashboards",      label: "My Dashboards",              icon: <BarChart3 className="w-4 h-4" />,       href: "/creator/dashboards",         group: "Content Studio", keywords: ["create", "dashboard", "chart"] },
  { id: "viz-builder",     label: "Visualizations",             icon: <BarChart3 className="w-4 h-4" />,       href: "/creator/visualizations",     group: "Content Studio", keywords: ["chart", "graph", "visualization"] },
  { id: "data-sources",    label: "Data Sources",               icon: <Network className="w-4 h-4" />,         href: "/data-sources",               group: "Content Studio", keywords: ["collectors", "agents", "ingestion"] },
  { id: "integrations",    label: "Integrations",               icon: <Puzzle className="w-4 h-4" />,          href: "/integrations",               group: "Content Studio", keywords: ["modules", "connectors", "plugins"] },
  { id: "data-parsing",    label: "Data Parsing / Pipelines",   icon: <Database className="w-4 h-4" />,        href: "/data-parsing",               group: "Content Studio", keywords: ["logstash", "filters", "pipeline"] },
  // ── Admin
  { id: "admin-users",     label: "User Management",            icon: <Users className="w-4 h-4" />,           href: "/admin/users",                group: "Admin" },
  { id: "admin-settings",  label: "System Settings",            icon: <Settings className="w-4 h-4" />,        href: "/admin/settings",             group: "Admin",       keywords: ["config", "configuration"] },
  { id: "variables",       label: "Automation Variables",       icon: <Zap className="w-4 h-4" />,             href: "/admin/variables",            group: "Admin" },
  { id: "notifications",   label: "Notification Rules",         icon: <Bell className="w-4 h-4" />,            href: "/admin/notifications",        group: "Admin" },
  { id: "my-account",      label: "My Account",                 icon: <Settings className="w-4 h-4" />,        href: "/settings",                   group: "Admin",       keywords: ["profile", "account", "password"] },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? COMMANDS.filter(cmd => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.group.toLowerCase().includes(q) ||
          cmd.keywords?.some(k => k.includes(q))
        );
      })
    : COMMANDS;

  const groupSet = new Set(filtered.map(c => c.group));
  const groups = Array.from(groupSet);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(s => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        const cmd = filtered[selected];
        if (cmd) { router.push(cmd.href); onClose(); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, filtered, selected, router, onClose]);

  if (!open) return null;

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-command flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-overlay/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl mx-4 animate-scale-in">
        <div className="card-glass rounded-xl shadow-dropdown border border-surface-border-strong overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
            <Search className="w-4 h-4 text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search pages, actions..."
              className="flex-1 bg-transparent text-body text-primary placeholder:text-muted outline-none"
            />
            <kbd className="px-1.5 py-0.5 rounded border border-surface-border text-tiny text-muted font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-96 overflow-y-auto py-2">
            {filtered.length === 0 && (
              <div className="py-8 text-center text-muted text-small">
                No results for &ldquo;{query}&rdquo;
              </div>
            )}
            {groups.map(group => {
              const groupItems = filtered.filter(c => c.group === group);
              return (
                <div key={group}>
                  <div className="px-4 py-1.5">
                    <span className="text-micro text-muted uppercase tracking-wider font-medium">{group}</span>
                  </div>
                  {groupItems.map(cmd => {
                    const idx = globalIndex++;
                    const isSelected = idx === selected;
                    return (
                      <button
                        key={cmd.id}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          isSelected
                            ? "bg-brand-subtle text-brand"
                            : "text-secondary hover:bg-surface-tertiary hover:text-primary",
                        )}
                        onMouseEnter={() => setSelected(idx)}
                        onClick={() => { router.push(cmd.href); onClose(); }}
                      >
                        <span className={cn(
                          "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                          isSelected ? "bg-brand text-white" : "bg-surface-tertiary text-muted",
                        )}>
                          {cmd.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-small font-medium", isSelected ? "text-brand" : "text-primary")}>
                            {cmd.label}
                          </span>
                          {cmd.description && (
                            <p className="text-tiny text-muted truncate">{cmd.description}</p>
                          )}
                        </div>
                        {isSelected && <ArrowRight className="w-3.5 h-3.5 shrink-0 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-surface-border px-4 py-2 flex items-center gap-4 text-tiny text-muted">
            <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">ESC</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
