"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Download, X, Shield, ChevronRight, ToggleLeft, ToggleRight,
  Loader2, AlertCircle, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { mitreService, type TechniqueCoverage } from "@/services/mitre.service";

interface MitreTechnique {
  id: string;
  name: string;
  tactic: string;
  subtechniques: string[];
}

interface RuleRef {
  id: number;
  name: string;
  active: boolean;
}

// ── MITRE tactic ordering ─────────────────────────────────────────────────────

const TACTICS = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
] as const;

// ── Cell state helpers ────────────────────────────────────────────────────────

type CellState = "empty" | "disabled-only" | "covered" | "well-covered";

function cellState(cov: TechniqueCoverage | undefined): CellState {
  if (!cov || cov.ruleCount === 0) return "empty";
  if (cov.activeCount === 0) return "disabled-only";
  if (cov.activeCount >= 3) return "well-covered";
  return "covered";
}

const CELL_CLASSES: Record<CellState, string> = {
  "empty":         "bg-muted/10 border-transparent text-muted/40",
  "disabled-only": "bg-slate-500/15 border-dashed border-slate-500/30 text-slate-400",
  "covered":       "bg-amber-500/15 border-amber-500/35 text-amber-300",
  "well-covered":  "bg-green-500/15 border-green-500/35 text-green-300",
};

// ── Donut chart ───────────────────────────────────────────────────────────────

function CoverageDonut({ pct }: { pct: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-border" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke="currentColor" strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        className="text-brand transition-all duration-700"
      />
    </svg>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

interface DrawerProps {
  technique: MitreTechnique;
  coverage: TechniqueCoverage | undefined;
  onClose: () => void;
  onToggleRule: (ruleId: number, active: boolean) => void;
}

function TechniqueDrawer({ technique, coverage, onClose, onToggleRule }: DrawerProps) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    api.get<Array<{ id: number; name: string; active: boolean }>>(
      `/api/mitre/rules?techniqueId=${encodeURIComponent(technique.id)}`
    )
      .then((data) => {
        setRules(data.map((r) => ({ id: r.id, name: r.name, active: r.active })));
      })
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [technique.id]);

  const handleToggle = async (rule: RuleRef) => {
    setToggling((prev) => new Set(prev).add(rule.id));
    try {
      await api.put(`/api/correlation-rule/activate-deactivate?id=${rule.id}&active=${!rule.active}`, {});
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, active: !r.active } : r));
      onToggleRule(rule.id, !rule.active);
    } catch {
      toast("error", "Toggle failed");
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(rule.id); return s; });
    }
  };

  const state = cellState(coverage);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[420px] max-w-full bg-surface-ground border-l border-surface-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-surface-border shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-tiny bg-surface-card px-1.5 py-0.5 rounded border border-surface-border text-brand">
                {technique.id}
              </span>
              {state !== "empty" && (
                <span className={cn(
                  "text-tiny px-1.5 py-0.5 rounded",
                  state === "well-covered" && "bg-green-500/20 text-green-300",
                  state === "covered" && "bg-amber-500/20 text-amber-300",
                  state === "disabled-only" && "bg-slate-500/20 text-slate-400",
                )}>
                  {state === "well-covered" && "Well Covered"}
                  {state === "covered" && "Covered"}
                  {state === "disabled-only" && "Disabled Only"}
                </span>
              )}
            </div>
            <h2 className="text-h3 text-primary">{technique.name}</h2>
            <p className="text-tiny text-muted mt-0.5">{technique.tactic}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm p-1.5 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 p-5 border-b border-surface-border shrink-0">
          <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
            <div className="text-h2 font-bold tabular-nums text-primary">{coverage?.ruleCount ?? 0}</div>
            <div className="text-tiny text-muted">Total rules</div>
          </div>
          <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
            <div className="text-h2 font-bold tabular-nums text-success">{coverage?.activeCount ?? 0}</div>
            <div className="text-tiny text-muted">Active rules</div>
          </div>
        </div>

        {/* Rule list */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-small font-semibold text-secondary mb-3">Rules covering this technique</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-muted text-small">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : rules.length === 0 ? (
            <div className="flex items-center gap-2 text-muted text-small">
              <AlertCircle className="w-4 h-4" /> No rules found
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col gap-2 bg-surface-card rounded-lg p-3 border border-surface-border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-small text-primary leading-snug">{rule.name}</span>
                    <button
                      onClick={() => {
                        onClose();
                        router.push(`/rules?ruleId=${rule.id}`);
                      }}
                      className="shrink-0 btn btn-ghost btn-sm p-1 text-muted hover:text-brand"
                      title="Open in Rules Editor"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(rule)}
                      disabled={toggling.has(rule.id)}
                      className={cn(
                        "btn btn-sm gap-1.5 disabled:opacity-50",
                        rule.active ? "btn-secondary" : "bg-success/10 text-success border border-success/20 hover:bg-success/20"
                      )}
                    >
                      {toggling.has(rule.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : rule.active ? (
                        <ToggleLeft className="w-3.5 h-3.5" />
                      ) : (
                        <ToggleRight className="w-3.5 h-3.5" />
                      )}
                      {rule.active ? "Disable" : "Enable"}
                    </button>
                    <span className={cn(
                      "text-tiny px-1.5 py-0.5 rounded",
                      rule.active ? "bg-success/10 text-success" : "bg-muted/10 text-muted"
                    )}>
                      {rule.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipState {
  technique: MitreTechnique;
  coverage: TechniqueCoverage | undefined;
  x: number;
  y: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MitreCoveragePage() {
  const [allTechniques, setAllTechniques] = useState<MitreTechnique[]>([]);
  const [coverageMap, setCoverageMap] = useState<Map<string, TechniqueCoverage>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [drawer, setDrawer] = useState<{ technique: MitreTechnique; coverage: TechniqueCoverage | undefined } | null>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [techData, covData] = await Promise.all([
        fetch("/mitre-attack-v15.json").then((r) => r.json()) as Promise<MitreTechnique[]>,
        mitreService.getCoverage(),
      ]);
      setAllTechniques(techData);

      // Build name→id lookup from static data for fuzzy matching
      const nameToId = new Map<string, string>();
      for (const t of techData) {
        nameToId.set(t.name.toLowerCase(), t.id);
      }

      // Normalize DB technique strings to T-code IDs:
      // "T1003.001 - OS Credential Dumping: LSASS Memory" → "T1003.001"
      // "Account Access Removal" → look up by name → "T1531"
      const map = new Map<string, TechniqueCoverage>();
      for (const cov of covData) {
        const raw = cov.technique;
        const tcodeMatch = raw.match(/^(T\d{4}(?:\.\d{3})?)/);
        if (tcodeMatch) {
          const id = tcodeMatch[1];
          const existing = map.get(id);
          if (existing) {
            map.set(id, { technique: id, ruleCount: existing.ruleCount + cov.ruleCount, activeCount: existing.activeCount + cov.activeCount });
          } else {
            map.set(id, { ...cov, technique: id });
          }
        } else {
          // Try name match (strip subtechnique suffix after ":")
          const baseName = raw.split(":")[0].trim().toLowerCase();
          const id = nameToId.get(baseName) ?? nameToId.get(raw.toLowerCase());
          if (id) {
            const existing = map.get(id);
            if (existing) {
              map.set(id, { technique: id, ruleCount: existing.ruleCount + cov.ruleCount, activeCount: existing.activeCount + cov.activeCount });
            } else {
              map.set(id, { ...cov, technique: id });
            }
          }
        }
      }
      setCoverageMap(map);
    } catch (err) {
      console.error("Failed to load MITRE data:", err);
      toast("error", "Failed to load coverage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // KPI calculations
  const uniqueTechniques = new Set(allTechniques.map((t) => t.id));
  const totalMitreTechniques = uniqueTechniques.size;
  const coveredTechniques = Array.from(uniqueTechniques).filter((id) => {
    const cov = coverageMap.get(id);
    return cov && cov.activeCount > 0;
  });
  const coveragePct = totalMitreTechniques > 0
    ? Math.round((coveredTechniques.length / totalMitreTechniques) * 100)
    : 0;
  const totalRules = Array.from(coverageMap.values()).reduce((s, c) => s + c.ruleCount, 0);
  const activeRules = Array.from(coverageMap.values()).reduce((s, c) => s + c.activeCount, 0);

  // Group techniques by tactic (deduplicate per tactic)
  const byTactic = new Map<string, MitreTechnique[]>();
  for (const t of allTechniques) {
    const existing = byTactic.get(t.tactic);
    if (!existing) {
      byTactic.set(t.tactic, [t]);
    } else if (!existing.find((e) => e.id === t.id)) {
      existing.push(t);
    }
  }

  const handleExport = async () => {
    try {
      await mitreService.exportCsv();
      toast("success", "Coverage exported");
    } catch {
      toast("error", "Export failed");
    }
  };

  const handleCellHover = (
    e: React.MouseEvent,
    technique: MitreTechnique,
    coverage: TechniqueCoverage | undefined
  ) => {
    clearTimeout(tooltipTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ technique, coverage, x: rect.left, y: rect.bottom + 4 });
  };

  const handleCellLeave = () => {
    tooltipTimeout.current = setTimeout(() => setTooltip(null), 150);
  };

  const handleDrawerToggle = () => {
    setCoverageMap((prev) => new Map(prev));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted text-small">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading MITRE coverage…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-1 pb-6">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand" />
            MITRE ATT&amp;CK Coverage
          </h1>
          <p className="text-secondary text-small mt-0.5">
            Active detection coverage mapped to ATT&amp;CK v15 techniques
          </p>
        </div>
        <button className="btn btn-secondary btn-sm gap-1.5 shrink-0" onClick={handleExport}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Coverage donut */}
        <div className="bg-surface-card rounded-xl border border-surface-border p-4 flex items-center gap-4 col-span-2 md:col-span-1">
          <div className="relative shrink-0">
            <CoverageDonut pct={coveragePct} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-small font-bold tabular-nums text-primary">{coveragePct}%</span>
            </div>
          </div>
          <div>
            <div className="text-tiny text-muted">Coverage</div>
            <div className="text-h3 font-bold text-primary tabular-nums">
              {coveredTechniques.length} <span className="text-muted font-normal">/ {totalMitreTechniques}</span>
            </div>
            <div className="text-tiny text-muted">techniques</div>
          </div>
        </div>

        <div className="bg-surface-card rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="text-tiny text-muted">Active Rules</div>
          <div className="text-h2 font-bold tabular-nums text-success">{activeRules.toLocaleString()}</div>
          <div className="text-tiny text-muted">of {totalRules.toLocaleString()} total</div>
        </div>

        <div className="bg-surface-card rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="text-tiny text-muted">Well Covered</div>
          <div className="text-h2 font-bold tabular-nums text-brand">
            {Array.from(uniqueTechniques).filter((id) => {
              const c = coverageMap.get(id);
              return c && c.activeCount >= 3;
            }).length}
          </div>
          <div className="text-tiny text-muted">3+ active rules</div>
        </div>

        <div className="bg-surface-card rounded-xl border border-surface-border p-4 flex flex-col justify-between">
          <div className="text-tiny text-muted">Uncovered</div>
          <div className="text-h2 font-bold tabular-nums text-critical">
            {totalMitreTechniques - coveredTechniques.length}
          </div>
          <div className="text-tiny text-muted">no active rules</div>
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 text-tiny text-muted flex-wrap">
        <span className="font-medium text-secondary">Legend:</span>
        {[
          { state: "well-covered" as CellState, label: "Well covered (3+)" },
          { state: "covered" as CellState, label: "Covered (1-2)" },
          { state: "disabled-only" as CellState, label: "Disabled only" },
          { state: "empty" as CellState, label: "No rules" },
        ].map(({ state, label }) => (
          <div key={state} className="flex items-center gap-1.5">
            <div className={cn("w-4 h-4 rounded border text-[10px] leading-none", CELL_CLASSES[state])} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Matrix ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1">
        <div
          className="grid gap-2 min-w-max px-1"
          style={{ gridTemplateColumns: `repeat(${TACTICS.length}, minmax(130px, 1fr))` }}
        >
          {/* Tactic headers */}
          {TACTICS.map((tactic) => (
            <div
              key={tactic}
              className="bg-surface-card rounded-t-lg border border-surface-border border-b-0 px-2 py-2 text-center"
            >
              <span className="text-tiny font-semibold text-secondary leading-snug">{tactic}</span>
            </div>
          ))}

          {/* Technique cells per tactic column */}
          {TACTICS.map((tactic) => {
            const techniques = byTactic.get(tactic) ?? [];
            return (
              <div key={tactic} className="flex flex-col gap-1 bg-surface-card/30 rounded-b-lg border border-t-0 border-surface-border p-1.5">
                {techniques.length === 0 ? (
                  <div className="h-8 rounded border border-transparent" />
                ) : (
                  techniques.map((tech) => {
                    const cov = coverageMap.get(tech.id);
                    const state = cellState(cov);
                    return (
                      <button
                        key={`${tactic}-${tech.id}`}
                        className={cn(
                          "w-full text-left rounded border px-1.5 py-1 transition-all group",
                          "hover:ring-1 hover:ring-brand/50 hover:shadow-sm cursor-pointer",
                          CELL_CLASSES[state],
                          state === "empty" && "hover:bg-muted/20"
                        )}
                        onMouseEnter={(e) => handleCellHover(e, tech, cov)}
                        onMouseLeave={handleCellLeave}
                        onClick={() => setDrawer({ technique: tech, coverage: cov })}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] leading-none truncate">{tech.id}</span>
                          {cov && cov.ruleCount > 0 && (
                            <span className={cn(
                              "shrink-0 text-[9px] font-bold px-1 rounded-full leading-tight",
                              state === "well-covered" && "bg-green-500/30 text-green-200",
                              state === "covered" && "bg-amber-500/30 text-amber-200",
                              state === "disabled-only" && "bg-slate-500/30 text-slate-300",
                            )}>
                              {cov.activeCount}/{cov.ruleCount}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tooltip ───────────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 280), top: tooltip.y }}
          onMouseEnter={() => clearTimeout(tooltipTimeout.current)}
          onMouseLeave={handleCellLeave}
        >
          <div
            className="rounded-lg shadow-2xl p-3 w-64 border"
            style={{
              background: "color-mix(in srgb, #0f1117 92%, var(--brand-primary))",
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="font-mono text-tiny px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", color: "var(--brand-primary)" }}
              >
                {tooltip.technique.id}
              </span>
              <span className="text-small font-semibold text-white truncate">{tooltip.technique.name}</span>
            </div>
            <p className="text-tiny mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>{tooltip.technique.tactic}</p>
            {tooltip.coverage ? (
              <div className="flex items-center gap-1.5 text-tiny">
                <span className="text-green-400 font-semibold">{tooltip.coverage.activeCount} active</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>/ {tooltip.coverage.ruleCount} total</span>
              </div>
            ) : (
              <div className="text-tiny" style={{ color: "rgba(255,255,255,0.35)" }}>No rules for this technique</div>
            )}
            <div className="flex items-center gap-1 mt-2 text-tiny" style={{ color: "var(--brand-primary)", opacity: 0.7 }}>
              <span>Click to view details</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer ───────────────────────────────────────────────────────────── */}
      {drawer && (
        <TechniqueDrawer
          technique={drawer.technique}
          coverage={drawer.coverage}
          onClose={() => setDrawer(null)}
          onToggleRule={handleDrawerToggle}
        />
      )}
    </div>
  );
}
