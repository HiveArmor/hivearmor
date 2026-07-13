"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Upload, Download, Shield, CheckCircle2, XCircle, Clock,
  AlertTriangle, Loader2, ToggleLeft, ToggleRight, Trash2, FileUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { RulesListPanel } from "@/components/rules/rules-list-panel";
import { RulesEditorPanel } from "@/components/rules/rules-editor-panel";
import { RuleHistoryDrawer } from "@/components/rules/rule-history-drawer";
import { ResponseRulesPanel } from "@/components/rules/response-rules-panel";
import { RulePacksPanel } from "@/components/rules/rule-packs-panel";
import { detectionService, type CorrelationRule, type SigmaImportResult } from "@/services/detection.service";
import type { DetectionRule } from "@/components/rules/rules-list-panel";
import MitreCoveragePage from "./coverage/page";

// ── helpers: map backend ↔ frontend DetectionRule shape ──────────────────────

function backendToFrontend(r: CorrelationRule): DetectionRule {
  return {
    id: String(r.id),
    name: r.name ?? "Unnamed Rule",
    description: r.description ?? "",
    severity: (["critical","high","medium","low","informational"].includes(r.confidentiality >= 8 ? "critical" : r.confidentiality >= 6 ? "high" : r.confidentiality >= 4 ? "medium" : "low")
      ? (r.confidentiality >= 8 ? "critical" : r.confidentiality >= 6 ? "high" : r.confidentiality >= 4 ? "medium" : "low")
      : "medium") as DetectionRule["severity"],
    status: r.ruleActive ? "enabled" : "disabled",
    category: (r.category as DetectionRule["category"]) ?? "authentication",
    source: r.systemOwner ? "builtin" : "custom",
    mitreIds: r.technique ? [r.technique] : [],
    mitreTactics: [],
    author: "HiveArmor",
    createdAt: r.ruleLastUpdate ?? new Date().toISOString(),
    updatedAt: r.ruleLastUpdate ?? new Date().toISOString(),
    alertCount: 0,
    falsePositives: 0,
    favorited: false,
    logSources: r.dataTypes?.map((d) => d.dsName) ?? [],
    sigma: typeof r.definition === "string" ? r.definition : undefined,
    _backendId: r.id,
  } as DetectionRule & { _backendId: number };
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ rules }: { rules: DetectionRule[] }) {
  const enabled  = rules.filter((r) => r.status === "enabled").length;
  const disabled = rules.filter((r) => r.status === "disabled").length;
  const testing  = rules.filter((r) => r.status === "testing").length;
  const critical = rules.filter((r) => r.severity === "critical").length;

  const chips = [
    { icon: <CheckCircle2 className="w-3.5 h-3.5" />, value: enabled,  label: "Enabled",  color: "text-success" },
    { icon: <XCircle className="w-3.5 h-3.5" />,       value: disabled, label: "Disabled", color: "text-muted" },
    { icon: <Clock className="w-3.5 h-3.5" />,         value: testing,  label: "Testing",  color: "text-warning" },
    { icon: <AlertTriangle className="w-3.5 h-3.5" />, value: critical, label: "Critical", color: "text-critical" },
    { icon: <Shield className="w-3.5 h-3.5" />,        value: rules.length, label: "Total", color: "text-brand" },
  ];

  return (
    <div className="flex items-center gap-4 px-1 pb-3 flex-wrap shrink-0">
      {chips.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5">
          <span className={cn("shrink-0", c.color)}>{c.icon}</span>
          <span className={cn("text-h4 font-bold tabular-nums", c.color)}>{c.value.toLocaleString()}</span>
          <span className="text-tiny text-muted">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (result: SigmaImportResult) => void }) {
  const [format, setFormat] = useState<"SIGMA" | "HA_NATIVE">("SIGMA");
  const [content, setContent] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setContent(ev.target?.result as string ?? "");
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!content.trim()) return;
    setImporting(true);
    try {
      const result = await detectionService.importRules(format, content);
      onImported(result);
      onClose();
    } catch (err) {
      console.error("Import failed:", err);
      toast("error", "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[20vh] z-[70] mx-auto max-w-xl bg-surface-primary rounded-2xl border border-surface-border shadow-drawer overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <FileUp className="w-4 h-4 text-brand" />
            <p className="text-small font-semibold text-primary">Import Rules</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="input-base w-full text-small">
              <option value="SIGMA">Sigma YAML</option>
              <option value="HA_NATIVE">HA Native JSON</option>
            </select>
          </div>
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="input-base w-full text-small font-mono resize-none"
              placeholder="Paste rule content here, or use the button below to upload a file"
            />
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".yml,.yaml,.json" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} className="btn btn-sm btn-secondary gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
            <span className="text-tiny text-muted">.yml / .yaml / .json accepted</span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-surface-border flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
          <button onClick={handleImport} disabled={importing || !content.trim()} className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50">
            {importing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</> : "Import"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "detection" | "response" | "packs" | "coverage";

export default function RulesPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("detection");
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [selectedRule, setSelectedRule] = useState<DetectionRule | null>(null);
  const [isNew, setIsNew] = useState(false);
  // ruleId from deep-link (?ruleId=<backendId>) — applied once rules load
  const pendingRuleId = useRef<number | null>(
    searchParams.get("ruleId") ? Number(searchParams.get("ruleId")) : null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [historyRule, setHistoryRule] = useState<DetectionRule | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);

  // Mapping from frontend string id → backend numeric id
  const backendIdMap = useRef<Map<string, number>>(new Map());

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const { data } = await detectionService.search({}, 0, 200);
      const mapped = data.map((r) => {
        const fe = backendToFrontend(r);
        backendIdMap.current.set(fe.id, r.id);
        return fe;
      });
      setRules(mapped);
      // Honour deep-link ?ruleId= from ATT&CK coverage drawer
      if (pendingRuleId.current !== null) {
        const target = mapped.find((r) => backendIdMap.current.get(r.id) === pendingRuleId.current);
        if (target) {
          setSelectedRule(target);
          setActiveTab("detection");
        }
        pendingRuleId.current = null;
      }
    } catch (err) {
      console.error("Failed to load rules:", err);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleSelect = (rule: DetectionRule) => {
    setSelectedRule(rule);
    setIsNew(false);
  };

  const handleNewRule = () => {
    setSelectedRule(null);
    setIsNew(true);
  };

  const severityToScore = (s: DetectionRule["severity"]): number =>
    ({ critical: 3, high: 2, medium: 1, low: 1, informational: 0 } as Record<string, number>)[s] ?? 1;

  const handleSave = useCallback(async (updated: DetectionRule) => {
    const backendId = backendIdMap.current.get(updated.id);
    const payload: Partial<CorrelationRule> = {
      name: updated.name,
      description: updated.description,
      category: updated.category,
      technique: updated.mitreIds[0] ?? "T1000",
      adversary: "origin" as CorrelationRule["adversary"],
      confidentiality: severityToScore(updated.severity),
      integrity: severityToScore(updated.severity),
      availability: severityToScore(updated.severity),
      ruleActive: updated.status === "enabled",
      definition: updated.sigma ?? "",
    };

    if (backendId) {
      // Update existing rule
      await detectionService.update({ ...payload, id: backendId });
      setRules((prev) => {
        const idx = prev.findIndex((r) => r.id === updated.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
      setSelectedRule(updated);
      toast("success", "Rule saved", updated.name);
    } else {
      // Create new rule — reload so backendIdMap gets populated with the real id
      await detectionService.create(payload);
      toast("success", "Rule created", updated.name);
      setIsNew(false);
      setSelectedRule(null);
      await loadRules();
    }
  }, [loadRules]);

  const handleClose = () => {
    setSelectedRule(null);
    setIsNew(false);
  };

  const handleTest = useCallback(async () => {
    const bId = selectedRule ? backendIdMap.current.get(selectedRule.id) : null;
    if (!bId) return;
    const result = await detectionService.testRule(bId);
    toast(
      result.syntaxOk ? "success" : "warning",
      result.syntaxOk ? "Test passed" : "Syntax warning",
      `${result.variableCount} variables, ~${result.simulatedMatchCount} simulated matches (${result.durationMs}ms)`
    );
  }, [selectedRule]);

  const handleExport = async () => {
    try {
      const { data } = await detectionService.search({}, 0, 1000);
      const yaml = data.map((r) => `# ${r.name}\n# id: ${r.id}\n`).join("\n---\n");
      const blob = new Blob([yaml], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "hivearmor-rules.yml"; a.click();
      URL.revokeObjectURL(url);
      toast("success", "Rules exported", `${data.length} rules`);
    } catch {
      toast("error", "Export failed");
    }
  };

  const handleImported = (result: SigmaImportResult) => {
    toast("success", "Import complete", `${result.imported} imported, ${result.skipped} skipped`);
    loadRules();
  };

  const handleBulkEnable = async () => {
    const ids = Array.from(selectedIds).map((sid) => backendIdMap.current.get(sid)).filter((id): id is number => !!id);
    if (!ids.length) return;
    setBulkWorking(true);
    try {
      await detectionService.bulkEnable(ids);
      setRules((prev) => prev.map((r) => selectedIds.has(r.id) ? { ...r, status: "enabled" } : r));
      toast("success", "Bulk enabled", `${ids.length} rules enabled`);
      setSelectedIds(new Set());
    } catch { toast("error", "Bulk enable failed"); }
    finally { setBulkWorking(false); }
  };

  const handleBulkDisable = async () => {
    const ids = Array.from(selectedIds).map((sid) => backendIdMap.current.get(sid)).filter((id): id is number => !!id);
    if (!ids.length) return;
    setBulkWorking(true);
    try {
      await detectionService.bulkDisable(ids);
      setRules((prev) => prev.map((r) => selectedIds.has(r.id) ? { ...r, status: "disabled" } : r));
      toast("success", "Bulk disabled", `${ids.length} rules disabled`);
      setSelectedIds(new Set());
    } catch { toast("error", "Bulk disable failed"); }
    finally { setBulkWorking(false); }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds).map((sid) => backendIdMap.current.get(sid)).filter((id): id is number => !!id);
    if (!ids.length) return;
    setBulkWorking(true);
    try {
      await detectionService.bulkDelete(ids);
      setRules((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      if (selectedRule && selectedIds.has(selectedRule.id)) handleClose();
      toast("success", "Rules deleted", `${ids.length} rules removed`);
      setSelectedIds(new Set());
    } catch { toast("error", "Bulk delete failed"); }
    finally { setBulkWorking(false); }
  };

  const handleRollback = (restoredRule: CorrelationRule) => {
    const fe = backendToFrontend(restoredRule);
    backendIdMap.current.set(fe.id, restoredRule.id);
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === fe.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = fe; return next; }
      return prev;
    });
    setSelectedRule(fe);
    toast("success", "Rolled back", fe.name);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "detection", label: "Detection Rules" },
    { id: "response",  label: "Response Rules" },
    { id: "packs",     label: "Rule Packs" },
    { id: "coverage",  label: "ATT&CK Coverage" },
  ];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--spacing-shell-top, 80px))" }}>
      {/* ── Page header ───────────────────────────────────── */}
      <div className="flex items-start justify-between px-1 pb-3 shrink-0">
        <div>
          <h1 className="text-h1">Rules</h1>
          <p className="text-secondary text-small mt-0.5">Correlation rules, automated response, and rule packs</p>
        </div>
        {activeTab === "detection" && (
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-tiny text-muted">{selectedIds.size} selected</span>
                <button onClick={handleBulkEnable} disabled={bulkWorking} className="btn btn-secondary btn-sm gap-1.5 disabled:opacity-50">
                  <ToggleRight className="w-3.5 h-3.5" /> Enable
                </button>
                <button onClick={handleBulkDisable} disabled={bulkWorking} className="btn btn-secondary btn-sm gap-1.5 disabled:opacity-50">
                  <ToggleLeft className="w-3.5 h-3.5" /> Disable
                </button>
                <button onClick={handleBulkDelete} disabled={bulkWorking} className="btn btn-sm gap-1.5 disabled:opacity-50 bg-critical/10 text-critical border border-critical/20 hover:bg-critical/20">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
            <button className="btn btn-secondary btn-sm gap-1.5" onClick={() => setShowImport(true)}>
              <Upload className="w-4 h-4" /> Import
            </button>
            <button className="btn btn-secondary btn-sm gap-1.5" onClick={handleExport}>
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        )}
      </div>

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-surface-border shrink-0 mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-4 py-2 text-small font-medium border-b-2 transition-colors",
              activeTab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-secondary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Detection Rules tab ───────────────────────────── */}
      {activeTab === "detection" && (
        <>
          <StatsBar rules={rules} />
          {loadingRules ? (
            <div className="flex items-center justify-center flex-1 gap-2 text-small text-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading rules…
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 border border-surface-border rounded-lg overflow-hidden">
              {/* Left: rule list */}
              <div className="w-[320px] shrink-0 flex flex-col min-h-0">
                <RulesListPanel
                  rules={rules}
                  selectedId={selectedRule?.id ?? null}
                  onSelect={handleSelect}
                  onNewRule={handleNewRule}
                  onImport={() => setShowImport(true)}
                />
              </div>

              {/* Right: editor */}
              <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-surface-ground">
                <RulesEditorPanel
                  rule={selectedRule}
                  isNew={isNew}
                  onSave={handleSave}
                  onClose={handleClose}
                  onHistory={selectedRule ? () => setHistoryRule(selectedRule) : undefined}
                  onTest={selectedRule ? handleTest : undefined}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Response Rules tab ────────────────────────────── */}
      {activeTab === "response" && (
        <div className="flex-1 min-h-0 border border-surface-border rounded-lg overflow-hidden">
          <ResponseRulesPanel />
        </div>
      )}

      {/* ── Rule Packs tab ────────────────────────────────── */}
      {activeTab === "packs" && (
        <div className="flex-1 min-h-0 border border-surface-border rounded-lg overflow-y-auto">
          <RulePacksPanel />
        </div>
      )}

      {/* ── ATT&CK Coverage tab ───────────────────────────── */}
      {activeTab === "coverage" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MitreCoveragePage />
        </div>
      )}

      {/* ── Modals / drawers ──────────────────────────────── */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={handleImported} />
      )}

      {historyRule && (
        <RuleHistoryDrawer
          ruleId={backendIdMap.current.get(historyRule.id) ?? 0}
          ruleName={historyRule.name}
          onClose={() => setHistoryRule(null)}
          onRollback={handleRollback}
        />
      )}
    </div>
  );
}
