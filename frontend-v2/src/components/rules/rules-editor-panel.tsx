"use client";

import React, {
  useState, useCallback, useRef, useEffect, type ReactNode,
} from "react";
import {
  Play, Save, Copy, RotateCcw,
  Tag, Map, Settings, TestTube2, BookOpen, AlertCircle,
  CheckCircle2, Info, Plus, X, Loader2,
  BarChart3, ShieldAlert, FileText, GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetectionRule, RuleSeverity, RuleStatus } from "./rules-list-panel";
import { SEV_META, STATUS_META } from "./rules-list-panel";

// ── Monaco lazy-loaded via useEffect (avoids Next.js dynamic() forwardRef issue) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoComponentType = React.ComponentType<any>;
let _cachedMonacoRules: MonacoComponentType | null = null;

function useMonaco() {
  const [ready, setReady] = useState(!!_cachedMonacoRules);
  useEffect(() => {
    if (_cachedMonacoRules) { setReady(true); return; }
    import("@monaco-editor/react").then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (mod as any).default;
      const inner = raw?.$$typeof ? raw : (raw?.default ?? raw);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _cachedMonacoRules = function MonacoEditorWrapper(props: any) {
        const ref = React.useRef(null);
        return inner.render ? inner.render(props, ref) : inner(props);
      };
      setReady(true);
    }).catch(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _cachedMonacoRules = ({ value, onChange }: any) => (
        <textarea
          className="w-full h-full font-mono text-small bg-surface-secondary text-primary p-3 resize-none outline-none"
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
      setReady(true);
    });
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ready ? _cachedMonacoRules as any : null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EditorTab = "editor" | "test" | "suppression" | "metadata" | "stats";

interface TestResult {
  matched: boolean;
  duration: number;
  matchedEvents: number;
  falsePositiveRate: number;
  sampleMatches: SampleMatch[];
  errors?: string[];
}

interface SampleMatch {
  id: string;
  timestamp: string;
  source: string;
  fields: Record<string, string>;
  matchedCondition: string;
}

interface SuppressionRule {
  id: string;
  field: string;
  value: string;
  type: "exact" | "wildcard" | "regex";
  note: string;
}

// ── Default new-rule template ─────────────────────────────────────────────────

export const NEW_RULE_SIGMA = `title: New Detection Rule
id:
status: experimental
description: Describe what this rule detects
author:
date: ${new Date().toISOString().slice(0, 10).replace(/-/g, "/")}
logsource:
  category:
  product:
detection:
  selection:
    EventID:
  condition: selection
falsepositives:
  -
level: medium
tags:
  - attack.
`;

// ── MITRE tactic / technique reference ───────────────────────────────────────

const MITRE_TACTICS = [
  "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
  "Collection", "Command and Control", "Exfiltration", "Impact",
];

const DEMO_TEST_RESULT: TestResult = {
  matched: true,
  duration: 142,
  matchedEvents: 27,
  falsePositiveRate: 14.8,
  sampleMatches: [
    {
      id: "evt-001",
      timestamp: "2024-04-10T08:23:11Z",
      source: "windows-dc01",
      fields: { EventID: "4625", SourceAddress: "10.0.1.45", TargetUserName: "admin", FailureReason: "Wrong password" },
      matchedCondition: "EventID=4625 count>5 by SourceAddress",
    },
    {
      id: "evt-002",
      timestamp: "2024-04-10T09:11:44Z",
      source: "windows-ws03",
      fields: { EventID: "4625", SourceAddress: "192.168.2.11", TargetUserName: "svc_backup", FailureReason: "Wrong password" },
      matchedCondition: "EventID=4625 count>5 by SourceAddress",
    },
  ],
  errors: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTitleFromSigma(yaml: string): string {
  const match = yaml.match(/^title:\s*(.+)/m);
  return match?.[1]?.trim() || "New Rule";
}

// ── FP rate badge ─────────────────────────────────────────────────────────────

function FpBadge({ rate }: { rate: number }) {
  const color = rate < 5 ? "text-success" : rate < 20 ? "text-warning" : "text-critical";
  return <span className={cn("text-tiny font-mono font-medium", color)}>{rate.toFixed(1)}%</span>;
}

// ── Suppression row ───────────────────────────────────────────────────────────

function SuppressionRow({ item, onDelete }: { item: SuppressionRule; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-tertiary/50 border border-surface-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-tiny font-mono text-brand">{item.field}</span>
          <span className="text-tiny text-muted">{item.type === "exact" ? "=" : item.type === "wildcard" ? "~=" : "regex"}</span>
          <span className="text-tiny font-mono text-primary truncate">{item.value}</span>
        </div>
        {item.note && <p className="text-tiny text-muted mt-0.5">{item.note}</p>}
      </div>
      <button onClick={() => onDelete(item.id)} className="toolbar-btn shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Tab header ────────────────────────────────────────────────────────────────

function TabBtn({ id, label, icon, active, onClick }: {
  id: EditorTab; label: string; icon: ReactNode; active: boolean; onClick: (id: EditorTab) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-tiny font-medium border-b-2 -mb-px transition-colors shrink-0",
        active ? "text-brand border-brand" : "text-muted border-transparent hover:text-secondary"
      )}
    >
      {icon} {label}
    </button>
  );
}

// ── Main editor panel ─────────────────────────────────────────────────────────

interface RulesEditorPanelProps {
  rule: DetectionRule | null;
  isNew?: boolean;
  onSave: (rule: DetectionRule) => void | Promise<void>;
  onClose: () => void;
  onHistory?: () => void;
  onTest?: () => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RulesEditorPanel({ rule, isNew = false, onSave, onClose: _onClose, onHistory, onTest }: RulesEditorPanelProps) {
  const [tab, setTab] = useState<EditorTab>("editor");
  const [sigma, setSigma] = useState(rule?.sigma ?? NEW_RULE_SIGMA);
  const [severity, setSeverity] = useState<RuleSeverity>(rule?.severity ?? "medium");
  const [status, setStatus] = useState<RuleStatus>(rule?.status ?? "testing");
  const [mitreIds, setMitreIds] = useState<string[]>(rule?.mitreIds ?? []);
  const [mitreTactics, setMitreTactics] = useState<string[]>(rule?.mitreTactics ?? []);
  const [tags, setTags] = useState<string[]>(rule?.logSources ?? []);
  const [suppressions, setSuppressions] = useState<SuppressionRule[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newMitre, setNewMitre] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newSupp, setNewSupp] = useState({ field: "", value: "", type: "exact" as const, note: "" });
  const [showSuppForm, setShowSuppForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  const MonacoEditor = useMonaco();

  useEffect(() => {
    setSigma(rule?.sigma ?? NEW_RULE_SIGMA);
    setSeverity(rule?.severity ?? "medium");
    setStatus(rule?.status ?? "testing");
    setMitreIds(rule?.mitreIds ?? []);
    setMitreTactics(rule?.mitreTactics ?? []);
    setTags(rule?.logSources ?? []);
    setTestResult(null);
    setTab("editor");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule?.id]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTab("test");
    if (onTest) {
      await onTest().catch(() => {});
    } else {
      await new Promise((r) => setTimeout(r, 1400));
      setTestResult(DEMO_TEST_RESULT);
    }
    setTesting(false);
  }, [onTest]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (rule) {
        // Edit mode: merge form state into the existing rule
        onSave({ ...rule, sigma, severity, status, mitreIds, mitreTactics, logSources: tags });
      } else {
        // Create mode: synthesize a new rule from form state
        const now = new Date().toISOString();
        const newRule: DetectionRule = {
          id: "",
          name: extractTitleFromSigma(sigma),
          description: "",
          severity,
          status,
          category: "authentication",
          source: "custom",
          mitreIds,
          mitreTactics,
          author: "",
          createdAt: now,
          updatedAt: now,
          alertCount: 0,
          falsePositives: 0,
          favorited: false,
          logSources: tags,
          sigma,
        };
        onSave(newRule);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sigma);
  };

  const addMitre = () => {
    if (!newMitre.trim()) return;
    setMitreIds((prev) => [...prev, newMitre.trim().toUpperCase()]);
    setNewMitre("");
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    setTags((prev) => [...prev, newTag.trim()]);
    setNewTag("");
  };

  const addSuppression = () => {
    if (!newSupp.field || !newSupp.value) return;
    setSuppressions((prev) => [...prev, { ...newSupp, id: `s${Date.now()}` }]);
    setNewSupp({ field: "", value: "", type: "exact", note: "" });
    setShowSuppForm(false);
  };

  if (!rule && !isNew) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <div className="p-4 rounded-full bg-surface-tertiary">
          <FileText className="w-8 h-8 text-muted" />
        </div>
        <h3 className="text-h3 text-primary">No rule selected</h3>
        <p className="text-small text-muted">Select a rule from the list, or create a new one to start editing</p>
      </div>
    );
  }

  const sevM  = SEV_META[severity];
  const statM = STATUS_META[status];

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-border shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-small font-semibold text-primary truncate">{rule?.name ?? "New Rule"}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-tiny", sevM.color)}>{sevM.label}</span>
            <span className="text-surface-border">·</span>
            <span className={cn("flex items-center gap-0.5 text-tiny", statM.color)}>{statM.icon}{statM.label}</span>
            {rule?.alertCount != null && rule.alertCount > 0 && (
              <><span className="text-surface-border">·</span>
              <span className="text-tiny text-muted">{rule.alertCount.toLocaleString()} alerts/30d</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleCopy} className="toolbar-btn" title="Copy YAML"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={() => setSigma(rule?.sigma ?? NEW_RULE_SIGMA)} className="toolbar-btn" title="Reset"><RotateCcw className="w-3.5 h-3.5" /></button>
          {onHistory && !isNew && (
            <button onClick={onHistory} className="toolbar-btn" title="Version history"><GitBranch className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={handleTest} className="btn btn-secondary btn-sm" disabled={testing}>
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
            Test
          </button>
          <button onClick={handleSave} className="btn btn-primary btn-sm" disabled={saved || isSaving}>
            {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? "Saved" : isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-surface-border px-2 shrink-0">
        <TabBtn id="editor"      label="Sigma YAML"    icon={<BookOpen className="w-3 h-3" />}       active={tab === "editor"}      onClick={setTab} />
        <TabBtn id="test"        label="Test Run"      icon={<TestTube2 className="w-3 h-3" />}      active={tab === "test"}        onClick={setTab} />
        <TabBtn id="suppression" label="Suppressions"  icon={<ShieldAlert className="w-3 h-3" />}    active={tab === "suppression"} onClick={setTab} />
        <TabBtn id="metadata"    label="Metadata"      icon={<Tag className="w-3 h-3" />}            active={tab === "metadata"}    onClick={setTab} />
        <TabBtn id="stats"       label="Stats"         icon={<BarChart3 className="w-3 h-3" />}      active={tab === "stats"}       onClick={setTab} />
      </div>

      {/* ── Editor ────────────────────────────────────────── */}
      {tab === "editor" && (
        <div className="flex-1 min-h-0">
          {!MonacoEditor && (
            <textarea
              value={sigma}
              onChange={(e) => setSigma(e.target.value)}
              className="w-full h-full bg-surface-ground text-primary font-mono text-small p-4 resize-none outline-none border-0"
              spellCheck={false}
            />
          )}
          {MonacoEditor && (
            <MonacoEditor
              height="100%"
              defaultLanguage="yaml"
              value={sigma}
              onChange={(v: string | undefined) => setSigma(v ?? "")}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onMount={(editor: any) => { editorRef.current = editor; }}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
                minimap: { enabled: false },
                lineNumbers: "on",
                wordWrap: "on",
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: "gutter",
                bracketPairColorization: { enabled: true },
                tabSize: 2,
              }}
            />
          )}
        </div>
      )}

      {/* ── Test tab ──────────────────────────────────────── */}
      {tab === "test" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {testing && (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <p className="text-small text-muted">Running rule against last 30 days of events…</p>
            </div>
          )}

          {!testing && !testResult && (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <TestTube2 className="w-6 h-6 text-muted" />
              <p className="text-small text-muted">Click Test in the toolbar to run this rule</p>
              <button onClick={handleTest} className="btn btn-secondary btn-sm">
                <Play className="w-3.5 h-3.5" /> Run Test
              </button>
            </div>
          )}

          {!testing && testResult && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Matched Events",   value: testResult.matchedEvents.toString(), color: testResult.matched ? "text-success" : "text-muted" },
                  { label: "Duration",         value: `${testResult.duration}ms`,          color: "text-primary" },
                  { label: "FP Rate",          value: null,                                color: "" },
                  { label: "Errors",           value: (testResult.errors?.length ?? 0).toString(), color: testResult.errors?.length ? "text-critical" : "text-muted" },
                ].map((card, i) => (
                  <div key={i} className="card p-3">
                    <p className="text-tiny text-muted mb-1">{card.label}</p>
                    {card.value != null
                      ? <p className={cn("text-h3 font-bold", card.color)}>{card.value}</p>
                      : <FpBadge rate={testResult.falsePositiveRate} />
                    }
                  </div>
                ))}
              </div>

              {/* Errors */}
              {(testResult.errors?.length ?? 0) > 0 && (
                <div className="p-3 rounded-lg bg-critical/10 border border-critical/25 space-y-1">
                  {testResult.errors!.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-small text-critical">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{e}
                    </div>
                  ))}
                </div>
              )}

              {/* Sample matches */}
              <div>
                <p className="text-small font-semibold text-primary mb-2">Sample Matched Events</p>
                <div className="space-y-2">
                  {testResult.sampleMatches.map((m) => (
                    <div key={m.id} className="card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-tiny font-mono text-muted">{m.timestamp}</span>
                        <span className="text-tiny text-secondary">{m.source}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(m.fields).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-tiny">
                            <span className="text-muted shrink-0">{k}:</span>
                            <span className="text-primary font-mono truncate">{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-tiny text-brand bg-brand/8 px-2 py-1 rounded font-mono">
                        matched: {m.matchedCondition}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Suppressions ──────────────────────────────────── */}
      {tab === "suppression" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-h4 font-semibold text-primary">Suppression Rules</h3>
              <p className="text-tiny text-muted mt-0.5">Suppress specific alerts from triggering based on field values</p>
            </div>
            <button onClick={() => setShowSuppForm((v) => !v)} className="btn btn-secondary btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {showSuppForm && (
            <div className="card p-4 space-y-3 border-brand/30">
              <p className="text-small font-semibold text-primary">New Suppression</p>
              <div className="grid grid-cols-3 gap-2">
                <input value={newSupp.field} onChange={(e) => setNewSupp((p) => ({ ...p, field: e.target.value }))}
                  placeholder="Field (e.g. SourceAddress)" className="input-base text-small col-span-3 sm:col-span-1" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <select value={newSupp.type} onChange={(e) => setNewSupp((p) => ({ ...p, type: e.target.value as any }))}
                  className="input-base text-small">
                  <option value="exact">Exact</option>
                  <option value="wildcard">Wildcard</option>
                  <option value="regex">Regex</option>
                </select>
                <input value={newSupp.value} onChange={(e) => setNewSupp((p) => ({ ...p, value: e.target.value }))}
                  placeholder="Value (e.g. 10.0.0.*)" className="input-base text-small" />
              </div>
              <input value={newSupp.note} onChange={(e) => setNewSupp((p) => ({ ...p, note: e.target.value }))}
                placeholder="Note (optional)" className="input-base text-small w-full" />
              <div className="flex gap-2">
                <button onClick={addSuppression} className="btn btn-primary btn-sm">Add</button>
                <button onClick={() => setShowSuppForm(false)} className="btn btn-secondary btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {suppressions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <ShieldAlert className="w-6 h-6 text-muted" />
              <p className="text-small text-muted">No suppressions configured</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suppressions.map((s) => (
                <SuppressionRow key={s.id} item={s} onDelete={(id) => setSuppressions((p) => p.filter((r) => r.id !== id))} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Metadata ──────────────────────────────────────── */}
      {tab === "metadata" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Severity */}
          <div>
            <p className="text-small font-semibold text-primary mb-2">Severity</p>
            <div className="flex gap-2 flex-wrap">
              {(["critical", "high", "medium", "low", "informational"] as RuleSeverity[]).map((s) => {
                const m = SEV_META[s];
                return (
                  <button key={s} onClick={() => setSeverity(s)}
                    className={cn("px-3 py-1.5 rounded-lg border text-small capitalize transition-colors",
                      severity === s ? `${m.color} border-current bg-current/10` : "text-muted border-surface-border hover:bg-surface-tertiary"
                    )}
                  >{m.label}</button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-small font-semibold text-primary mb-2">Status</p>
            <div className="flex gap-2">
              {(["enabled", "testing", "disabled"] as RuleStatus[]).map((s) => {
                const m = STATUS_META[s];
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-small transition-colors",
                      status === s ? `${m.color} border-current bg-current/10` : "text-muted border-surface-border hover:bg-surface-tertiary"
                    )}
                  >{m.icon}{m.label}</button>
                );
              })}
            </div>
          </div>

          {/* MITRE Tactics */}
          <div>
            <p className="text-small font-semibold text-primary mb-2 flex items-center gap-1.5">
              <Map className="w-3.5 h-3.5 text-brand" /> MITRE Tactics
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MITRE_TACTICS.map((t) => (
                <button key={t} onClick={() => setMitreTactics((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                  className={cn("px-2 py-1 rounded text-tiny border transition-colors",
                    mitreTactics.includes(t) ? "bg-brand/15 text-brand border-brand/30" : "text-muted border-surface-border hover:bg-surface-tertiary"
                  )}>{t}</button>
              ))}
            </div>
          </div>

          {/* MITRE Technique IDs */}
          <div>
            <p className="text-small font-semibold text-primary mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-brand" /> MITRE Technique IDs
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {mitreIds.map((id) => (
                <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-tiny border border-purple-500/20">
                  {id}
                  <button onClick={() => setMitreIds((p) => p.filter((x) => x !== id))} className="hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newMitre} onChange={(e) => setNewMitre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMitre()}
                placeholder="e.g. T1059.001" className="input-base text-small flex-1" />
              <button onClick={addMitre} className="btn btn-secondary btn-sm">Add</button>
            </div>
          </div>

          {/* Log sources / tags */}
          <div>
            <p className="text-small font-semibold text-primary mb-2 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-brand" /> Log Sources
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-tertiary text-secondary text-tiny border border-surface-border">
                  {t}
                  <button onClick={() => setTags((p) => p.filter((x) => x !== t))} className="hover:text-primary">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="e.g. windows, linux, aws" className="input-base text-small flex-1" />
              <button onClick={addTag} className="btn btn-secondary btn-sm">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats tab ─────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!rule ? (
            <p className="text-small text-muted">Save the rule first to see statistics.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Alerts (30d)",   value: rule.alertCount.toLocaleString(),   color: rule.alertCount > 0 ? "text-primary" : "text-muted" },
                  { label: "False Positives", value: rule.falsePositives.toLocaleString(), color: rule.falsePositives > 10 ? "text-warning" : "text-primary" },
                  { label: "FP Rate",
                    value: rule.alertCount > 0 ? `${((rule.falsePositives / rule.alertCount) * 100).toFixed(1)}%` : "N/A",
                    color: rule.falsePositives > 0 ? "text-warning" : "text-muted" },
                  { label: "Last Updated",   value: new Date(rule.updatedAt).toLocaleDateString(), color: "text-secondary" },
                ].map((s) => (
                  <div key={s.label} className="card p-3">
                    <p className="text-tiny text-muted">{s.label}</p>
                    <p className={cn("text-h3 font-bold mt-1", s.color)}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Alert trend (mock sparkline) */}
              <div className="card p-4">
                <p className="text-small font-semibold text-primary mb-3">Alert Trend — Last 7 Days</p>
                <div className="flex items-end gap-1 h-16">
                  {[12, 8, 15, 22, 9, 31, 18].map((v, i) => (
                    <div key={i} className="flex-1 bg-brand/50 rounded-t hover:bg-brand transition-colors"
                      style={{ height: `${(v / 31) * 100}%` }}
                      title={`${v} alerts`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1.5">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <span key={d} className="text-tiny text-muted flex-1 text-center">{d}</span>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-tertiary/50 border border-surface-border/50">
                <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <p className="text-tiny text-muted">
                  Statistics are updated every 15 minutes. Alert counts include all statuses (open, closed, suppressed).
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
