"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Code2, FileText, Plus, Trash2, Save,
  CheckCircle2, XCircle, Activity, RefreshCw, Filter, Database,
  Download, Upload, Layers, Play, AlertTriangle, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import {
  logstashService,
  type LogstashPipelineDTO,
  type LogstashFilter,
  type LogstashFilterGroup,
} from "@/services/logstash.service";

// ─── Monaco lazy-load ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonacoComp = React.ComponentType<any>;
let _monacoCache: MonacoComp | null = null;

function useMonaco() {
  const [ready, setReady] = useState(!!_monacoCache);
  useEffect(() => {
    if (_monacoCache) { setReady(true); return; }
    import("@monaco-editor/react").then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (mod as any).default;
      _monacoCache = raw?.$$typeof ? raw : (raw?.default ?? raw);
      setReady(true);
    }).catch(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _monacoCache = ({ value, onChange }: any) => (
        <textarea
          className="w-full h-full font-mono text-small bg-surface-secondary text-primary p-3 resize-none outline-none border-0"
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
      setReady(true);
    });
  }, []);
  return ready ? _monacoCache : null;
}

const EDITOR_OPTS = {
  theme: "vs-dark",
  language: "yaml",
  fontSize: 13,
  fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace",
  lineNumbers: "on" as const,
  wordWrap: "on" as const,
  minimap: { enabled: false },
  formatOnPaste: true,
  formatOnType: false,
  scrollBeyondLastLine: false,
  padding: { top: 8, bottom: 8 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ up }: { up: boolean }) {
  return (
    <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", up ? "bg-success" : "bg-muted")} />
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny border", className)}>
      {children}
    </span>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "pipelines" | "filters" | "test";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "pipelines", label: "Pipelines", icon: <Layers className="w-3.5 h-3.5" /> },
  { id: "filters",   label: "Filters",   icon: <Filter className="w-3.5 h-3.5" /> },
  { id: "test",      label: "Test",      icon: <Play className="w-3.5 h-3.5" /> },
];

// ═════════════════════════════════════════════════════════════════════════════
// PIPELINES TAB
// ═════════════════════════════════════════════════════════════════════════════

function PipelinesTab() {
  const [pipelines, setPipelines] = useState<LogstashPipelineDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { content } = await logstashService.listPipelines(0, 100);
    setPipelines(content);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (p: LogstashPipelineDTO) => {
    if (p.systemOwner) {
      toast("error", "Cannot delete", "System-owned pipelines cannot be removed.");
      return;
    }
    setDeletingId(p.id);
    const ok = await logstashService.deletePipeline(p.id);
    setDeletingId(null);
    if (ok) {
      toast("success", "Pipeline deleted", `"${p.pipelineName}" removed.`);
      load();
    } else {
      toast("error", "Delete failed", "Could not remove pipeline.");
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      void (next.has(id) ? next.delete(id) : next.add(id));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted text-small">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading pipelines…
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="w-8 h-8 text-muted" />}
        title="No pipelines found"
        description="No active Logstash pipelines are registered in the system."
        action={<button onClick={load} className="btn btn-secondary btn-sm gap-1"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-tiny text-muted uppercase tracking-wider font-semibold">
          {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}
        </span>
        <button onClick={load} className="btn btn-secondary btn-sm gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="rounded-md border border-surface-border overflow-hidden">
        <table className="w-full text-small">
          <thead>
            <tr className="bg-surface-secondary border-b border-surface-border">
              <th className="text-left px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold w-6" />
              <th className="text-left px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold">Name</th>
              <th className="text-left px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold">Pipeline ID</th>
              <th className="text-left px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold">Module</th>
              <th className="text-left px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold">Status</th>
              <th className="text-left px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold">Owner</th>
              <th className="text-right px-4 py-2.5 text-tiny text-muted uppercase tracking-wider font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p) => {
              const isUp = p.pipelineStatus?.toLowerCase() === "up";
              const isExpanded = expanded.has(p.id);
              return (
                <React.Fragment key={p.id}>
                  <tr className="border-b border-surface-border last:border-0 hover:bg-surface-secondary/50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(p.id)}
                        className="text-muted hover:text-primary transition-colors"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-primary">{p.pipelineName}</td>
                    <td className="px-4 py-3 font-mono text-muted text-tiny">{p.pipelineId}</td>
                    <td className="px-4 py-3 text-secondary">{p.moduleName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-tiny", isUp ? "text-success" : "text-muted")}>
                        <StatusDot up={isUp} />
                        {isUp ? "Up" : "Down"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.systemOwner
                        ? <Badge className="text-orange-400 bg-orange-400/10 border-orange-400/20">System</Badge>
                        : <Badge className="text-blue-400 bg-blue-400/10 border-blue-400/20">User</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={!!p.systemOwner || deletingId === p.id}
                        className="btn btn-danger btn-sm gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {deletingId === p.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                        Delete
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-surface-border last:border-0 bg-surface-secondary/30">
                      <td colSpan={7} className="px-8 py-3">
                        <div className="text-small text-secondary space-y-1">
                          {p.pipelineDescription
                            ? <p>{p.pipelineDescription}</p>
                            : <span className="text-muted italic">No description.</span>}
                          {p.pipelineInternal && (
                            <Badge className="text-purple-400 bg-purple-400/10 border-purple-400/20">Internal</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FILTERS TAB
// ═════════════════════════════════════════════════════════════════════════════

function FiltersTab() {
  const Monaco = useMonaco();

  const [pipelines, setPipelines] = useState<LogstashPipelineDTO[]>([]);
  const [groups, setGroups] = useState<LogstashFilterGroup[]>([]);
  const [filters, setFilters] = useState<LogstashFilter[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<LogstashFilter | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [editName, setEditName] = useState("");
  const [editGroupId, setEditGroupId] = useState<number | undefined>(undefined);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setLoadingPipelines(true);
      const [{ content: pl }, { content: gr }] = await Promise.all([
        logstashService.listPipelines(0, 200),
        logstashService.listFilterGroups(0, 200),
      ]);
      setPipelines(pl);
      setGroups(gr);
      setLoadingPipelines(false);
    })();
  }, []);

  const loadFilters = useCallback(async (pipelineId: number) => {
    setLoadingFilters(true);
    setSelectedFilter(null);
    setEditorValue("");
    setIsNew(false);
    const list = await logstashService.listFiltersByPipeline(pipelineId);
    setFilters(list);
    setLoadingFilters(false);
  }, []);

  const handleSelectPipeline = (id: number) => {
    setSelectedPipelineId(id);
    loadFilters(id);
  };

  const handleSelectFilter = (f: LogstashFilter) => {
    setSelectedFilter(f);
    setEditorValue(f.logstashFilter ?? "");
    setEditName(f.filterName ?? "");
    setEditGroupId(f.filterGroupId ?? undefined);
    setIsNew(false);
  };

  const handleNewFilter = () => {
    const blank: LogstashFilter = {
      filterName: "New Filter",
      logstashFilter: "filter {\n  # add your logstash filter here\n}\n",
      isActive: true,
    };
    setSelectedFilter(blank);
    setEditorValue(blank.logstashFilter);
    setEditName(blank.filterName ?? "");
    setEditGroupId(undefined);
    setIsNew(true);
  };

  const handleSave = async () => {
    if (!selectedFilter) return;
    if (!editName.trim()) { toast("error", "Validation", "Filter name is required."); return; }
    if (!editorValue.trim()) { toast("error", "Validation", "Filter body cannot be empty."); return; }

    setSaving(true);
    const payload: LogstashFilter = {
      ...selectedFilter,
      filterName: editName.trim(),
      logstashFilter: editorValue,
      filterGroupId: editGroupId,
    };

    let result: LogstashFilter | null;
    if (isNew) {
      result = await logstashService.createFilter(payload, selectedPipelineId ?? undefined);
    } else {
      result = await logstashService.updateFilter(payload);
    }
    setSaving(false);

    if (result) {
      toast("success", "Saved", `"${editName}" saved successfully.`);
      setIsNew(false);
      setSelectedFilter(result);
      if (selectedPipelineId) loadFilters(selectedPipelineId);
    } else {
      toast("error", "Save failed", selectedFilter.systemOwner
        ? "System-owned filters cannot be modified."
        : "Could not save filter.");
    }
  };

  const handleDelete = async (f: LogstashFilter) => {
    if (!f.id) return;
    if (f.systemOwner) { toast("error", "Cannot delete", "System-owned filters are read-only."); return; }
    setDeletingId(f.id);
    const ok = await logstashService.deleteFilter(f.id);
    setDeletingId(null);
    if (ok) {
      toast("success", "Deleted", `"${f.filterName}" removed.`);
      if (selectedFilter?.id === f.id) { setSelectedFilter(null); setEditorValue(""); }
      if (selectedPipelineId) loadFilters(selectedPipelineId);
    } else {
      toast("error", "Delete failed", "Could not remove filter.");
    }
  };

  const handleExport = () => {
    if (filters.length === 0) { toast("warning", "Nothing to export", "Load filters first."); return; }
    logstashService.exportFilters(filters);
    toast("success", "Exported", `${filters.length} filter(s) downloaded.`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPipelineId) return;
    const text = await file.text();
    try {
      const items = logstashService.parseImportFile(text);
      let ok = 0;
      for (const item of items) {
        const r = await logstashService.createFilter(item, selectedPipelineId);
        if (r) ok++;
      }
      toast("success", "Import complete", `${ok} of ${items.length} filter(s) imported.`);
      loadFilters(selectedPipelineId);
    } catch {
      toast("error", "Import failed", "File must be a valid JSON array of filters.");
    }
    e.target.value = "";
  };

  const isReadOnly = !!selectedFilter?.systemOwner;

  return (
    <div className="flex gap-4" style={{ minHeight: "calc(100vh - 222px)" }}>

      {/* Left: pipeline selector + filter list */}
      <div className="flex flex-col gap-3" style={{ width: 280, flexShrink: 0 }}>

        {/* Pipeline select */}
        <div>
          <label className="block text-tiny text-muted font-semibold uppercase tracking-wider mb-1.5">
            Pipeline
          </label>
          {loadingPipelines ? (
            <div className="input-base w-full text-muted text-small">Loading…</div>
          ) : (
            <select
              className="input-base w-full"
              value={selectedPipelineId ?? ""}
              onChange={(e) => handleSelectPipeline(Number(e.target.value))}
            >
              <option value="" disabled>Select a pipeline…</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.pipelineName}</option>
              ))}
            </select>
          )}
        </div>

        {/* Filter list */}
        {selectedPipelineId && (
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center justify-between">
              <span className="text-tiny text-muted uppercase tracking-wider font-semibold">
                {loadingFilters ? "Loading…" : `${filters.length} filter(s)`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleExport}
                  className="p-1.5 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
                  title="Export filters as JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => importRef.current?.click()}
                  className="p-1.5 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
                  title="Import filters from JSON"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
                <button onClick={handleNewFilter} className="btn btn-primary btn-sm gap-1" title="New filter">
                  <Plus className="w-3.5 h-3.5" />
                  New
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
              {loadingFilters && (
                <div className="flex items-center justify-center py-8 text-muted text-small gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                </div>
              )}
              {!loadingFilters && filters.length === 0 && (
                <div className="text-center py-8 text-muted text-small">No filters for this pipeline.</div>
              )}
              {!loadingFilters && filters.map((f) => {
                const isSelected = selectedFilter?.id === f.id;
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectFilter(f)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelectFilter(f); }}
                    className={cn(
                      "card text-left p-3 transition-all w-full cursor-pointer",
                      isSelected
                        ? "border-brand/60 bg-brand/5"
                        : "hover:border-surface-border-strong hover:bg-surface-secondary"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-small font-medium text-primary truncate flex-1">
                        {f.filterName ?? "(unnamed)"}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(f); }}
                        disabled={!!f.systemOwner || deletingId === f.id}
                        className="p-1 rounded text-muted hover:text-critical hover:bg-critical/10 transition-colors disabled:opacity-30 flex-shrink-0"
                      >
                        {deletingId === f.id
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {f.filterVersion && (
                        <span className="text-tiny text-muted font-mono">v{f.filterVersion}</span>
                      )}
                      {f.systemOwner && (
                        <Badge className="text-orange-400 bg-orange-400/10 border-orange-400/20">System</Badge>
                      )}
                      <span className={cn("inline-flex items-center gap-1 text-tiny", f.isActive ? "text-success" : "text-muted")}>
                        {f.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {f.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!selectedPipelineId && !loadingPipelines && (
          <div className="text-center py-12 text-muted text-small">
            Select a pipeline to view its filters.
          </div>
        )}
      </div>

      {/* Right: editor */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {!selectedFilter ? (
          <div className="card flex-1 flex items-center justify-center">
            <EmptyState
              icon={<FileText className="w-8 h-8 text-muted" />}
              title="No filter selected"
              description="Pick a filter from the list or create a new one."
            />
          </div>
        ) : (
          <>
            {/* Metadata row */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-h3 text-primary">{isNew ? "New Filter" : "Edit Filter"}</h2>
                <div className="flex items-center gap-2">
                  {isReadOnly && (
                    <Badge className="text-orange-400 bg-orange-400/10 border-orange-400/20">
                      Read-only (system)
                    </Badge>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || isReadOnly}
                    className="btn btn-primary btn-sm gap-1 disabled:opacity-40"
                  >
                    {saving
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Save className="w-3.5 h-3.5" />}
                    {saving ? "Saving…" : "Save Filter"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-tiny text-muted font-semibold uppercase tracking-wider mb-1.5">
                    Filter Name
                  </label>
                  <input
                    className="input-base w-full"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter filter name…"
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <label className="block text-tiny text-muted font-semibold uppercase tracking-wider mb-1.5">
                    Filter Group
                  </label>
                  <select
                    className="input-base w-full"
                    value={editGroupId ?? ""}
                    onChange={(e) => setEditGroupId(e.target.value ? Number(e.target.value) : undefined)}
                    disabled={isReadOnly}
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.groupName}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Monaco editor */}
            <div className="card overflow-hidden flex-1" style={{ minHeight: 400 }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border bg-surface-secondary">
                <span className="text-tiny text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" />
                  Logstash Filter (YAML)
                </span>
                {isReadOnly && (
                  <span className="text-tiny text-warning flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Read-only
                  </span>
                )}
              </div>
              <div style={{ height: "calc(100% - 42px)", minHeight: 360 }}>
                {!Monaco ? (
                  <div className="flex items-center justify-center h-full text-muted text-small gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading editor…
                  </div>
                ) : (
                  <Monaco
                    value={editorValue}
                    onChange={(v: string | undefined) => !isReadOnly && setEditorValue(v ?? "")}
                    options={{ ...EDITOR_OPTS, readOnly: isReadOnly }}
                    height="100%"
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST TAB
// ═════════════════════════════════════════════════════════════════════════════

function TestTab() {
  const Monaco = useMonaco();
  const [sampleLog, setSampleLog] = useState("");
  const [filterYaml, setFilterYaml] = useState(
    "filter {\n  # Paste or write your Logstash filter here\n  grok {\n    match => { \"message\" => \"%{COMBINEDAPACHELOG}\" }\n  }\n}\n"
  );
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!sampleLog.trim()) { toast("warning", "No input", "Paste a sample log line first."); return; }
    if (!filterYaml.trim()) { toast("warning", "No filter", "Write a filter configuration first."); return; }
    setRunning(true);
    setResult(null);
    setError(null);

    // The backend doesn't expose a /test endpoint — simulate locally
    await new Promise((r) => setTimeout(r, 600));
    try {
      // Best-effort JSON parse for JSON logs
      const parsed = JSON.parse(sampleLog);
      setResult(JSON.stringify({ ...parsed, _parsed_by: "logstash-test", _timestamp: new Date().toISOString() }, null, 2));
      toast("success", "Test complete", "Fields extracted from JSON input.");
    } catch {
      // Non-JSON: show tokenised mock output
      const tokens = sampleLog.split(/\s+/).slice(0, 10);
      const mockOut: Record<string, string> = { message: sampleLog };
      tokens.forEach((t, i) => { mockOut[`field_${i + 1}`] = t; });
      setResult(JSON.stringify(mockOut, null, 2));
      toast("success", "Test complete", "(Client-side simulation — connect backend for real parsing.)");
    }
    setRunning(false);
  };

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>

      {/* Left column: inputs */}
      <div className="flex flex-col gap-4">
        {/* Sample log input */}
        <div className="card p-4">
          <label className="block text-tiny text-muted font-semibold uppercase tracking-wider mb-2">
            Sample Log Input
          </label>
          <textarea
            className={cn(
              "w-full rounded-md border border-surface-border bg-[#0d1117]",
              "px-3 py-2.5 text-small text-green-300 placeholder:text-muted",
              "focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand resize-none"
            )}
            style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", minHeight: 80 }}
            value={sampleLog}
            onChange={(e) => { setSampleLog(e.target.value); setResult(null); setError(null); }}
            placeholder="Paste a raw log line here…"
          />
        </div>

        {/* Filter YAML */}
        <div className="card overflow-hidden flex-1" style={{ minHeight: 320 }}>
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-surface-border bg-surface-secondary">
            <Code2 className="w-3.5 h-3.5 text-muted" />
            <span className="text-tiny text-muted uppercase tracking-wider font-semibold">Filter Config (YAML)</span>
          </div>
          <div style={{ height: 280 }}>
            {!Monaco ? (
              <textarea
                className="w-full h-full font-mono text-small bg-surface-secondary text-primary p-3 resize-none outline-none border-0"
                value={filterYaml}
                onChange={(e) => setFilterYaml(e.target.value)}
              />
            ) : (
              <Monaco
                value={filterYaml}
                onChange={(v: string | undefined) => setFilterYaml(v ?? "")}
                options={EDITOR_OPTS}
                height={280}
              />
            )}
          </div>
        </div>

        <button
          onClick={handleTest}
          disabled={running}
          className="btn btn-primary gap-1.5 self-start"
        >
          {running
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : <Play className="w-3.5 h-3.5" />}
          {running ? "Running…" : "Run Test"}
        </button>
      </div>

      {/* Right column: results */}
      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand" />
          <h3 className="text-h4 text-primary">Parsed Output</h3>
        </div>

        {!result && !error && !running && (
          <div className="flex-1 flex items-center justify-center py-16">
            <EmptyState
              size="sm"
              icon={<Play className="w-6 h-6 text-muted" />}
              title="No results yet"
              description="Paste a log line and click Run Test."
            />
          </div>
        )}

        {running && (
          <div className="flex items-center justify-center py-16 gap-2 text-muted text-small">
            <RefreshCw className="w-4 h-4 animate-spin" /> Parsing…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-critical/10 border border-critical/20 text-small text-critical">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && (
          <pre
            className={cn(
              "flex-1 rounded-md border border-surface-border bg-[#0d1117]",
              "px-3 py-2.5 text-small text-green-300 overflow-auto whitespace-pre"
            )}
            style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", minHeight: 300 }}
          >
            {result}
          </pre>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function DataParsingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pipelines");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-primary">Logstash Pipeline &amp; Filter Management</h1>
          <p className="text-secondary text-small mt-0.5">
            Manage Logstash pipelines, configure filters, and test log parsing rules.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Database className="w-4 h-4 text-muted" />
          <span className="text-tiny text-muted">Backend: :8088</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-surface-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-small font-medium transition-colors border-b-2 -mb-px",
              activeTab === t.id
                ? "text-brand border-brand"
                : "text-muted border-transparent hover:text-secondary"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "pipelines" && <PipelinesTab />}
      {activeTab === "filters"   && <FiltersTab />}
      {activeTab === "test"      && <TestTab />}
    </div>
  );
}
