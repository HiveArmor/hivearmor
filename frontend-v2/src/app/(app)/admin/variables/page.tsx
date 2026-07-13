"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Loader2, Eye, EyeOff, KeyRound, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  incidentVariableService,
  type IncidentVariable,
} from "@/services/incident-variable.service";

// ── Variable form modal ────────────────────────────────────────────────────────

function VariableModal({
  variable,
  onClose,
  onSaved,
}: {
  variable: IncidentVariable | null;
  onClose: () => void;
  onSaved: (v: IncidentVariable) => void;
}) {
  const isNew = !variable?.id;
  const [form, setForm] = useState<Omit<IncidentVariable, "id" | "createdBy" | "lastModifiedBy" | "lastModifiedDate">>(
    variable
      ? { variableName: variable.variableName, variableValue: variable.variableValue, variableDescription: variable.variableDescription, secret: variable.secret }
      : { variableName: "", variableValue: "", variableDescription: "", secret: false }
  );
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.variableName.trim()) { toast("error", "Name is required"); return; }
    setSaving(true);
    try {
      const saved = variable?.id
        ? await incidentVariableService.update({ ...variable, ...form })
        : await incidentVariableService.create(form);
      onSaved(saved);
      toast("success", isNew ? "Variable created" : "Variable updated", form.variableName);
    } catch {
      toast("error", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-[15vh] z-[70] mx-auto max-w-lg bg-surface-primary rounded-2xl border border-surface-border shadow-drawer overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-brand" />
            <p className="text-small font-semibold text-primary">
              {isNew ? "New Variable" : `Edit — ${variable?.variableName}`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Name</label>
              <input
                value={form.variableName}
                onChange={e => setForm(f => ({ ...f, variableName: e.target.value }))}
                className="input-base w-full text-small"
                placeholder="e.g. API_KEY"
                required
              />
            </div>

            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Value</label>
              <div className="relative">
                <input
                  type={form.secret && !showValue ? "password" : "text"}
                  value={form.variableValue}
                  onChange={e => setForm(f => ({ ...f, variableValue: e.target.value }))}
                  className="input-base w-full text-small pr-9"
                  placeholder="Variable value"
                />
                {form.secret && (
                  <button
                    type="button"
                    onClick={() => setShowValue(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                    tabIndex={-1}
                  >
                    {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-tiny font-medium text-secondary mb-1 block">Description</label>
              <textarea
                value={form.variableDescription}
                onChange={e => setForm(f => ({ ...f, variableDescription: e.target.value }))}
                rows={2}
                className="input-base w-full text-small resize-none"
                placeholder="What is this variable used for?"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, secret: !f.secret }))}
                className={cn(
                  "w-9 h-5 rounded-full transition-colors flex items-center px-0.5",
                  form.secret ? "bg-brand" : "bg-surface-border",
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white shadow transition-transform",
                  form.secret ? "translate-x-4" : "translate-x-0",
                )} />
              </div>
              <span className="text-small text-secondary">Secret (mask value)</span>
            </label>
          </div>

          <div className="px-5 py-4 border-t border-surface-border flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-sm btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isNew ? "Create Variable" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminVariablesPage() {
  const [variables, setVariables] = useState<IncidentVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editVar, setEditVar] = useState<IncidentVariable | null | "new">(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  const loadVariables = useCallback(async () => {
    setLoading(true);
    try {
      const data = await incidentVariableService.list();
      setVariables(data);
    } catch {
      toast("error", "Failed to load variables");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVariables(); }, [loadVariables]);

  const handleSaved = (v: IncidentVariable) => {
    setVariables(vs => {
      const idx = vs.findIndex(x => x.id === v.id);
      return idx >= 0 ? vs.map((x, i) => i === idx ? v : x) : [v, ...vs];
    });
    setEditVar(null);
  };

  const handleDelete = async (v: IncidentVariable) => {
    try {
      await incidentVariableService.delete(v.id!);
      setVariables(vs => vs.filter(x => x.id !== v.id));
      setConfirmDeleteId(null);
      toast("success", "Variable deleted");
    } catch {
      toast("error", "Delete failed");
    }
  };

  const toggleReveal = (id: number) => {
    setRevealedIds(s => {
      const next = new Set(s);
      void (next.has(id) ? next.delete(id) : next.add(id));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Automation Variables</h1>
          <p className="text-secondary text-small mt-0.5">
            Variables used in SOAR playbooks and incident response workflows
          </p>
        </div>
        <button onClick={() => setEditVar("new")} className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Variable
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-14 text-center text-small text-muted">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading variables…
          </div>
        ) : variables.length === 0 ? (
          <div className="py-14 text-center text-small text-muted">
            <KeyRound className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No variables yet — click <strong>New Variable</strong> to add one
          </div>
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-4 py-3 text-tiny font-medium text-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-tiny font-medium text-muted uppercase tracking-wide">Value</th>
                <th className="text-left px-4 py-3 text-tiny font-medium text-muted uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-tiny font-medium text-muted uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {variables.map(v => {
                const revealed = revealedIds.has(v.id!);
                return (
                  <tr key={v.id} className="hover:bg-surface-secondary/30 transition-colors group">
                    <td className="px-4 py-3 font-mono text-primary font-medium">{v.variableName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("font-mono text-secondary", v.secret && !revealed && "tracking-widest")}>
                          {v.secret && !revealed ? "••••••••" : v.variableValue || <span className="text-muted italic">empty</span>}
                        </span>
                        {v.secret && (
                          <button
                            onClick={() => toggleReveal(v.id!)}
                            className="text-muted hover:text-secondary shrink-0"
                          >
                            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted max-w-xs truncate">{v.variableDescription || "—"}</td>
                    <td className="px-4 py-3">
                      {v.secret ? (
                        <span className="text-micro px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">SECRET</span>
                      ) : (
                        <span className="text-micro px-1.5 py-0.5 rounded bg-surface-tertiary text-muted">STRING</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {confirmDeleteId === v.id ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-tiny text-muted">Delete?</span>
                          <button
                            onClick={() => handleDelete(v)}
                            className="btn btn-sm gap-1.5 text-critical border border-critical/20 bg-critical/5 hover:bg-critical/15"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="btn btn-sm btn-secondary"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditVar(v)}
                            className="btn btn-sm btn-secondary gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(v.id!)}
                            className="btn btn-sm gap-1.5 text-critical border border-critical/20 bg-critical/5 hover:bg-critical/15"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editVar !== null && (
        <VariableModal
          variable={editVar === "new" ? null : editVar}
          onClose={() => setEditVar(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
