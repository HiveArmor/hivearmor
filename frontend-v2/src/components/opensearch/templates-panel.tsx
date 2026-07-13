"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, Plus, Trash2, Edit2, X, Check, ChevronRight, Loader2, AlertTriangle, FileCode,
} from "lucide-react";
import { opensearchService, type IndexTemplate } from "@/services/opensearch-management.service";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function JsonEditor({ value, onChange, readOnly = false }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  const [text, setText] = useState(value);
  const [valid, setValid] = useState(true);

  useEffect(() => { setText(value); }, [value]);

  const handle = (raw: string) => {
    setText(raw);
    try { JSON.parse(raw); setValid(true); onChange?.(raw); } catch { setValid(false); }
  };

  return (
    <div className={cn("relative rounded border", valid ? "border-surface-border" : "border-critical/50")}>
      <textarea
        value={text}
        onChange={(e) => handle(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        rows={12}
        className="w-full bg-surface-tertiary text-tiny font-mono text-secondary p-3 rounded resize-none focus:outline-none focus:ring-1 focus:ring-brand/50"
      />
      {!valid && <p className="absolute bottom-2 right-2 text-tiny text-critical">Invalid JSON</p>}
    </div>
  );
}

interface EditState {
  name: string;
  json: string;
  isNew: boolean;
}

export function TemplatesPanel() {
  const [templates, setTemplates] = useState<IndexTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [edit, setEdit]           = useState<EditState | null>(null);
  const [working, setWorking]     = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await opensearchService.listTemplates();
      setTemplates(res?.index_templates ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!edit) return;
    const { name, json } = edit;
    if (!name.trim()) { toast("error", "Name required", ""); return; }
    let body: unknown;
    try { body = JSON.parse(json); } catch { toast("error", "Invalid JSON", ""); return; }
    setWorking("save");
    try {
      await opensearchService.upsertTemplate(name.trim(), body);
      toast("success", edit.isNew ? "Template created" : "Template saved", name.trim());
      await load();
      setEdit(null);
    } catch (e: unknown) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
    }
  };

  const handleDelete = async (name: string) => {
    setWorking(name);
    try {
      await opensearchService.deleteTemplate(name);
      setTemplates((prev) => prev.filter((t) => t.name !== name));
      toast("success", "Template deleted", name);
    } catch (e: unknown) {
      toast("error", "Delete failed", e instanceof Error ? e.message : "");
    } finally {
      setWorking(null);
      setConfirmDelete(null);
    }
  };

  const openNew = () => {
    setEdit({ name: "", json: JSON.stringify({ index_patterns: ["*"], priority: 100, template: { settings: {}, mappings: {} } }, null, 2), isNew: true });
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const openEdit = (t: IndexTemplate) => {
    setEdit({ name: t.name, json: JSON.stringify(t.index_template, null, 2), isNew: false });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-4 border-b border-surface-border shrink-0">
        <FileCode className="w-4 h-4 text-brand shrink-0" />
        <p className="text-small font-semibold text-primary flex-1">Index Templates</p>
        <button onClick={openNew} className="btn btn-sm btn-primary gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Template
        </button>
        <button onClick={load} disabled={loading} className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
        <span className="text-tiny text-muted">{templates.length} templates</span>
      </div>

      {/* Edit panel */}
      {edit && (
        <div className="border-b border-surface-border bg-surface-secondary p-4 space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <p className="text-small font-semibold text-primary">{edit.isNew ? "New Template" : `Edit: ${edit.name}`}</p>
            <button onClick={() => setEdit(null)} className="ml-auto text-muted hover:text-secondary p-1 rounded hover:bg-surface-tertiary"><X className="w-3.5 h-3.5" /></button>
          </div>
          {edit.isNew && (
            <div>
              <label className="text-tiny text-muted mb-1 block">Template name</label>
              <input
                ref={nameRef}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="my-template"
                className="input-base w-full max-w-xs text-small font-mono"
              />
            </div>
          )}
          <div>
            <label className="text-tiny text-muted mb-1 block">Template body (JSON)</label>
            <JsonEditor value={edit.json} onChange={(v) => setEdit({ ...edit, json: v })} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={working === "save"}
              className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
            >
              {working === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </button>
            <button onClick={() => setEdit(null)} className="btn btn-sm btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && templates.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-2 text-small text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 gap-2 text-small text-warning">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-small text-muted">No index templates found.</div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.name} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80"
                    onClick={() => setExpanded(expanded === t.name ? null : t.name)}
                  >
                    <ChevronRight className={cn("w-3.5 h-3.5 text-muted transition-transform shrink-0", expanded === t.name && "rotate-90")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-small font-medium text-primary font-mono">{t.name}</p>
                      <p className="text-tiny text-muted">
                        Patterns: {t.index_template.index_patterns?.join(", ")}
                        {t.index_template.priority != null && ` · Priority: ${t.index_template.priority}`}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(t)}
                      title="Edit"
                      className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {confirmDelete === t.name ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(t.name)}
                          disabled={working === t.name}
                          className="text-tiny px-2 py-0.5 rounded bg-critical/15 text-critical border border-critical/20 hover:bg-critical/25 disabled:opacity-50"
                        >
                          {working === t.name ? "…" : "Confirm"}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="text-tiny px-2 py-0.5 rounded text-muted hover:text-secondary">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(t.name)}
                        disabled={working !== null}
                        title="Delete"
                        className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {expanded === t.name && (
                  <div className="border-t border-surface-border bg-surface-secondary px-4 py-3">
                    <JsonEditor value={JSON.stringify(t.index_template, null, 2)} readOnly />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
