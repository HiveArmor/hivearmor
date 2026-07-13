"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Edit2, Trash2, Send, Loader2, CheckCircle2, XCircle,
  Clock, X, Shield,
} from "lucide-react";
import { detectionService, type AlertResponseRule, type PushLogEntry } from "@/services/detection.service";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ── Push progress modal ───────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:      { label: "Pending",      color: "text-muted",    icon: <Clock className="w-3.5 h-3.5" /> },
  DELIVERED:    { label: "Delivered",    color: "text-success",  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  FAILED:       { label: "Failed",       color: "text-critical", icon: <XCircle className="w-3.5 h-3.5" /> },
  ACKNOWLEDGED: { label: "Acknowledged", color: "text-brand",    icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

function PushProgressModal({ ruleId, ruleName, onClose }: { ruleId: number; ruleName: string; onClose: () => void }) {
  const [logs, setLogs] = useState<PushLogEntry[]>([]);
  const [pushing, setPushing] = useState(false);
  const [polling, setPolling] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const updated = await detectionService.getPushStatus(ruleId);
      setLogs(updated);
      const allDone = updated.every((l) => l.pushStatus !== "PENDING");
      if (allDone) setPolling(false);
    } catch (err) {
      console.error("Poll failed:", err);
    }
  }, [ruleId]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(pollStatus, 2000);
    const timeout = setTimeout(() => { setPolling(false); clearInterval(interval); }, 30000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [polling, pollStatus]);

  const handlePush = async () => {
    setPushing(true);
    try {
      await detectionService.pushRule(ruleId, []);
      await pollStatus();
      setPolling(true);
      toast("success", "Push initiated", `Pushing "${ruleName}" to agents`);
    } catch (err) {
      console.error("Push failed:", err);
      toast("error", "Push failed", "Could not push rule to agents");
    } finally {
      setPushing(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[20vh] z-[70] mx-auto max-w-lg bg-surface-primary rounded-2xl border border-surface-border shadow-drawer overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-brand/15 flex items-center justify-center">
              <Send className="w-3.5 h-3.5 text-brand" />
            </div>
            <div>
              <p className="text-small font-semibold text-primary">Push to Agents</p>
              <p className="text-tiny text-muted truncate max-w-[280px]">{ruleName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {logs.length === 0 ? (
            <p className="text-small text-muted text-center py-4">
              Click &quot;Push&quot; to distribute this rule to all matching agents.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {logs.map((log) => {
                const meta = STATUS_META[log.pushStatus] ?? STATUS_META.PENDING;
                return (
                  <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-secondary">
                    <span className="text-small text-secondary font-mono truncate max-w-[200px]">{log.agentId}</span>
                    <span className={cn("flex items-center gap-1 text-tiny font-medium", meta.color)}>
                      {log.pushStatus === "PENDING" && polling
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pending…</>
                        : <>{meta.icon} {meta.label}</>
                      }
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn btn-sm btn-secondary">Close</button>
            <button onClick={handlePush} disabled={pushing || polling} className="btn btn-sm btn-primary gap-1.5 disabled:opacity-60">
              {pushing
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pushing…</>
                : <><Send className="w-3.5 h-3.5" /> Push</>
              }
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Create / Edit modal ────────────────────────────────────────────────────────

interface Condition { field: string; operator: string; value: string; }

function ResponseRuleModal({
  rule,
  onClose,
  onSave,
}: {
  rule: AlertResponseRule | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !rule;
  const [name, setName] = useState(rule?.ruleName ?? "");
  const [description, setDescription] = useState(rule?.ruleDescription ?? "");
  const [cmd, setCmd] = useState(rule?.ruleCmd ?? "");
  const [shell, setShell] = useState(rule?.ruleShell ?? "bash");
  const [platform, setPlatform] = useState(rule?.agentPlatform ?? "");
  const [autoExecute, setAutoExecute] = useState(rule?.ruleActive ?? true);
  const [saving, setSaving] = useState(false);
  const [conditions, setConditions] = useState<Condition[]>(() => {
    if (!rule?.ruleConditions) return [{ field: "alert.severity", operator: ">=", value: "7" }];
    try { return JSON.parse(rule.ruleConditions) as Condition[]; } catch { return []; }
  });

  const addCondition = () => setConditions((c) => [...c, { field: "", operator: "equals", value: "" }]);
  const removeCondition = (i: number) => setConditions((c) => c.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, patch: Partial<Condition>) =>
    setConditions((c) => c.map((cond, idx) => idx === i ? { ...cond, ...patch } : cond));

  const handleSave = async () => {
    if (!name.trim() || !cmd.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<AlertResponseRule> = {
        ruleName: name,
        ruleDescription: description,
        ruleConditions: JSON.stringify(conditions),
        ruleCmd: cmd,
        ruleShell: shell,
        agentPlatform: platform,
        ruleActive: autoExecute,
        systemOwner: false,
      };
      if (isNew) {
        await detectionService.createResponseRule(payload);
      } else {
        await detectionService.updateResponseRule({ ...payload, id: rule.id });
      }
      toast("success", isNew ? "Rule created" : "Rule updated", name);
      onSave();
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      toast("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const TEMPLATE_VARS = ["{{alert.source.ip}}", "{{alert.hostname}}", "{{alert.id}}", "{{alert.severity}}"];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[5vh] bottom-[5vh] z-[70] mx-auto max-w-2xl bg-surface-primary rounded-2xl border border-surface-border shadow-drawer flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-brand/15 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-brand" />
            </div>
            <p className="text-small font-semibold text-primary">{isNew ? "New Response Rule" : "Edit Response Rule"}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name + description */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-tiny font-medium text-secondary mb-1 block">Rule Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-base w-full text-small" placeholder="Block Suspicious IP" />
            </div>
            <div className="col-span-2">
              <label className="text-tiny font-medium text-secondary mb-1 block">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-base w-full text-small" placeholder="Automatically blocks suspicious IPs on firewall" />
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-tiny font-medium text-secondary">Trigger Conditions</label>
              <button onClick={addCondition} className="btn btn-xs btn-secondary gap-1"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={cond.field}
                    onChange={(e) => updateCondition(i, { field: e.target.value })}
                    className="input-base flex-1 text-small font-mono"
                    placeholder="alert.severity"
                  />
                  <select
                    value={cond.operator}
                    onChange={(e) => updateCondition(i, { operator: e.target.value })}
                    className="input-base text-small w-28 shrink-0"
                  >
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="regex">regex</option>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                  </select>
                  <input
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    className="input-base flex-1 text-small"
                    placeholder="value"
                  />
                  <button onClick={() => removeCondition(i)} className="text-muted hover:text-critical shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Command */}
          <div>
            <label className="text-tiny font-medium text-secondary mb-1 block">Command *</label>
            <textarea
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              rows={4}
              className="input-base w-full text-small font-mono resize-none"
              placeholder={"iptables -A INPUT -s {{alert.source.ip}} -j DROP"}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v}
                  onClick={() => setCmd((c) => c + v)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-secondary hover:bg-surface-elevated font-mono"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Shell + platform */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Shell</label>
              <select value={shell} onChange={(e) => setShell(e.target.value)} className="input-base w-full text-small">
                <option value="bash">bash</option>
                <option value="sh">sh</option>
                <option value="powershell">powershell</option>
                <option value="cmd">cmd</option>
              </select>
            </div>
            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Target Platform</label>
              <input value={platform} onChange={(e) => setPlatform(e.target.value)} className="input-base w-full text-small" placeholder="linux, windows, …" />
            </div>
          </div>

          {/* Auto-execute toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoExecute((v) => !v)}
              className={cn("w-9 h-5 rounded-full transition-colors", autoExecute ? "bg-brand" : "bg-surface-tertiary")}
            >
              <span className={cn("block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mx-0.5", autoExecute ? "translate-x-4" : "translate-x-0")} />
            </button>
            <span className="text-small text-secondary">Auto-execute when alert matches</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-surface-border shrink-0 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !cmd.trim()} className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : "Save Rule"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ResponseRulesPanel() {
  const [rules, setRules] = useState<AlertResponseRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<AlertResponseRule | null | undefined>(undefined);
  const [pushRule, setPushRule] = useState<AlertResponseRule | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pushLogs, setPushLogs] = useState<Record<number, PushLogEntry[]>>({});

  const load = () => {
    setLoading(true);
    detectionService.searchResponseRules(0, 50)
      .then(({ data }) => {
        setRules(data);
        // Load push status for each rule
        data.forEach((r) => {
          detectionService.getPushStatus(r.id)
            .then((logs) => setPushLogs((prev) => ({ ...prev, [r.id]: logs })))
            .catch(() => {});
        });
      })
      .catch((err) => console.error("Failed to load response rules:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await detectionService.deleteResponseRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
      toast("error", "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const getLatestPushStatus = (ruleId: number): PushLogEntry | null => {
    const logs = pushLogs[ruleId];
    if (!logs || logs.length === 0) return null;
    return logs[0];
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div>
          <p className="text-small font-semibold text-primary">Response Rules</p>
          <p className="text-tiny text-muted">{rules.length} rule{rules.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setEditingRule(null)} className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Rule
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-small text-muted">
            <Shield className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium text-secondary">No response rules</p>
            <p className="text-tiny mt-1">Create rules to automatically execute commands when alerts match</p>
            <button onClick={() => setEditingRule(null)} className="btn btn-sm btn-primary mt-4 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Rule
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface-secondary text-muted uppercase tracking-wide text-[10px]">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Command</th>
                <th className="px-4 py-3 text-left font-medium">Platform</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Push</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rules.map((rule) => {
                const latestPush = getLatestPushStatus(rule.id);
                const pushMeta = latestPush ? STATUS_META[latestPush.pushStatus] : null;
                return (
                  <tr key={rule.id} className="hover:bg-surface-secondary transition-colors group">
                    <td className="px-4 py-3">
                      <p className="text-small font-medium text-primary truncate max-w-[180px]">{rule.ruleName}</p>
                      {rule.ruleDescription && (
                        <p className="text-tiny text-muted truncate max-w-[180px]">{rule.ruleDescription}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-tiny text-brand font-mono bg-brand/5 px-1.5 py-0.5 rounded truncate block max-w-[180px]">
                        {rule.ruleCmd}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-tiny text-muted">{rule.agentPlatform || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-tiny font-medium px-2 py-0.5 rounded",
                        rule.ruleActive ? "text-success bg-success/10" : "text-muted bg-surface-tertiary"
                      )}>
                        {rule.ruleActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {pushMeta ? (
                        <span className={cn("flex items-center gap-1 text-tiny", pushMeta.color)}>
                          {pushMeta.icon} {pushMeta.label}
                        </span>
                      ) : (
                        <span className="text-tiny text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className={cn("flex items-center gap-1 transition-opacity", confirmDeleteId === rule.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                        {confirmDeleteId === rule.id ? (
                          <>
                            <span className="text-tiny text-muted mr-1">Delete?</span>
                            <button onClick={() => handleDelete(rule.id)} disabled={deletingId === rule.id} className="btn btn-xs btn-danger">
                              {deletingId === rule.id ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="btn btn-xs btn-secondary">No</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setPushRule(rule)} className="btn btn-xs btn-secondary gap-1" title="Push to agents">
                              <Send className="w-3 h-3" />
                            </button>
                            <button onClick={() => setEditingRule(rule)} className="btn btn-xs btn-secondary gap-1" title="Edit">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => setConfirmDeleteId(rule.id)} className="btn btn-xs btn-ghost text-muted hover:text-critical" title="Delete">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {editingRule !== undefined && (
        <ResponseRuleModal
          rule={editingRule}
          onClose={() => setEditingRule(undefined)}
          onSave={load}
        />
      )}
      {pushRule && (
        <PushProgressModal
          ruleId={pushRule.id}
          ruleName={pushRule.ruleName}
          onClose={() => setPushRule(null)}
        />
      )}
    </div>
  );
}
