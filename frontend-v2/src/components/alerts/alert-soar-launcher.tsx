"use client";

import { useState, useEffect } from "react";
import {
  X, Zap, Shield, GitBranch, Globe, Search,
  Clock, CheckCircle2, Loader2, ChevronRight, Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { playbookService, type SavedPlaybook } from "@/services/playbook.service";

export interface PlaybookTemplate {
  id: string;
  name: string;
  category: "containment" | "enrichment" | "notification" | "remediation" | "investigation" | "custom";
  description: string;
  estimatedTime: string;
  steps: number;
  severity: string[];
}

const CAT_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  containment:   { label: "Containment",   color: "text-critical",      icon: <Shield className="w-3.5 h-3.5" /> },
  enrichment:    { label: "Enrichment",    color: "text-brand-accent",  icon: <Globe className="w-3.5 h-3.5" /> },
  notification:  { label: "Notification",  color: "text-brand",         icon: <Zap className="w-3.5 h-3.5" /> },
  remediation:   { label: "Remediation",   color: "text-success",       icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  investigation: { label: "Investigation", color: "text-warning",       icon: <Search className="w-3.5 h-3.5" /> },
  custom:        { label: "Custom",        color: "text-secondary",     icon: <Workflow className="w-3.5 h-3.5" /> },
};

function savedToTemplate(pb: SavedPlaybook): PlaybookTemplate {
  let stepCount = 0;
  try {
    const def = JSON.parse(pb.definitionJson);
    stepCount = Array.isArray(def.nodes) ? def.nodes.length : 0;
  } catch { /* ignore */ }
  return {
    id: String(pb.id),
    name: pb.name,
    category: "custom",
    description: pb.description ?? "Custom playbook",
    estimatedTime: stepCount > 0 ? `~${stepCount * 10}s` : "—",
    steps: stepCount,
    severity: ["critical", "high", "medium", "low"],
  };
}

interface AlertSoarLauncherProps {
  alertCount: number;
  alertId?: string;
  onLaunch: (playbookId: string) => Promise<void>;
  onClose: () => void;
}

export function AlertSoarLauncher({ alertCount, alertId, onLaunch, onClose }: AlertSoarLauncherProps) {
  const [playbooks, setPlaybooks] = useState<PlaybookTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [executionId, setExecutionId] = useState<number | null>(null);

  useEffect(() => {
    playbookService.list()
      .then((list) => setPlaybooks(list.map(savedToTemplate)))
      .catch((err) => {
        console.error("Failed to load playbooks:", err);
        setPlaybooks([]);
      })
      .finally(() => setLoadingList(false));
  }, []);

  const filtered = playbooks.filter((pb) => {
    if (filterCat !== "all" && pb.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return pb.name.toLowerCase().includes(q) || pb.description.toLowerCase().includes(q);
    }
    return true;
  });

  const selected = playbooks.find((pb) => pb.id === selectedId);

  const handleLaunch = async () => {
    if (!selectedId) return;
    setLaunching(true);
    try {
      // Call backend execute endpoint, then notify parent
      const numId = Number(selectedId);
      if (!isNaN(numId)) {
        const exec = await playbookService.execute(numId, alertId);
        setExecutionId(exec.id);
      }
      await onLaunch(selectedId);
      setLaunched(true);
    } catch (err) {
      console.error("Launch failed:", err);
    } finally {
      setLaunching(false);
    }
  };

  const categories = ["all", ...Array.from(new Set(playbooks.map((p) => p.category)))];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10vh] z-[70] mx-auto max-w-3xl bg-surface-primary rounded-2xl border border-surface-border shadow-drawer flex flex-col animate-scale-in overflow-hidden" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-brand" />
            </div>
            <div>
              <h2 className="text-h3 text-primary font-semibold">Launch SOAR Playbook</h2>
              <p className="text-tiny text-muted">
                Running against {alertCount} selected {alertCount === 1 ? "alert" : "alerts"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {launched ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
            <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center animate-scale-in">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <div className="text-center">
              <h3 className="text-h3 text-primary font-semibold">Playbook Launched</h3>
              <p className="text-small text-muted mt-1">
                <span className="text-primary font-medium">{selected?.name}</span> is running against {alertCount} {alertCount === 1 ? "alert" : "alerts"}.
              </p>
              {executionId && (
                <p className="text-tiny text-muted mt-1">Execution ID: #{executionId}</p>
              )}
            </div>
            <button onClick={onClose} className="btn btn-primary">
              <GitBranch className="w-4 h-4" /> Close
            </button>
          </div>
        ) : (
          <>
            {/* Search + category filters */}
            <div className="px-6 py-3 border-b border-surface-border space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Search playbooks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-base w-full pl-9 text-small"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-tiny capitalize transition-colors",
                      filterCat === cat
                        ? "bg-brand-subtle text-brand"
                        : "text-muted hover:text-secondary hover:bg-surface-tertiary"
                    )}
                  >
                    {cat === "all" ? "All" : (CAT_META[cat]?.label ?? cat)}
                  </button>
                ))}
              </div>
            </div>

            {/* Playbook list */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {loadingList ? (
                <div className="col-span-2 flex items-center justify-center py-12 text-small text-muted gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading playbooks…
                </div>
              ) : filtered.length === 0 ? (
                <div className="col-span-2 flex items-center justify-center py-12 text-small text-muted">
                  No playbooks found. <a href="/soar/flows" className="ml-1 text-brand hover:underline">Create one</a>.
                </div>
              ) : filtered.map((pb) => {
                const cat = CAT_META[pb.category] ?? CAT_META.custom;
                const isSelected = selectedId === pb.id;
                return (
                  <button
                    key={pb.id}
                    onClick={() => setSelectedId(isSelected ? null : pb.id)}
                    className={cn(
                      "text-left rounded-xl border p-3.5 transition-all",
                      isSelected
                        ? "border-brand bg-brand-subtle shadow-glow"
                        : "border-surface-border bg-surface-secondary hover:border-surface-border-focus hover:bg-surface-elevated"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                        "bg-surface-tertiary",
                        cat.color
                      )}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 justify-between">
                          <p className="text-small font-semibold text-primary leading-tight">{pb.name}</p>
                          {isSelected && <ChevronRight className="w-4 h-4 text-brand shrink-0" />}
                        </div>
                        <p className="text-tiny text-muted mt-0.5 line-clamp-2">{pb.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={cn("text-tiny font-medium", cat.color)}>{cat.label}</span>
                          <span className="flex items-center gap-1 text-tiny text-muted">
                            <Clock className="w-3 h-3" /> {pb.estimatedTime}
                          </span>
                          <span className="text-tiny text-muted">{pb.steps} steps</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-surface-border flex items-center justify-between shrink-0">
              <div className="text-small text-muted">
                {selectedId ? (
                  <span>
                    Selected: <span className="text-primary font-medium">{selected?.name}</span>
                  </span>
                ) : (
                  "Select a playbook to continue"
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn btn-sm btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleLaunch}
                  disabled={!selectedId || launching}
                  className="btn btn-sm btn-primary gap-2 disabled:opacity-50"
                >
                  {launching
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Launching…</>
                    : <><Zap className="w-3.5 h-3.5" /> Launch Playbook</>
                  }
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
