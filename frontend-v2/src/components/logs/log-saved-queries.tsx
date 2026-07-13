"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Star, StarOff, Clock, BookMarked, Trash2,
  PlayCircle, ChevronRight, LayoutTemplate, Save, Loader2, Pencil,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { logAnalyzerService, type ServerSavedQuery } from "@/services/log-analyzer.service";
import { toast } from "@/components/ui/toast";

// ── History (localStorage only) ─────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  query: string;
  indexPattern: string;
  ranAt: string;
  hits: number;
}

const HISTORY_KEY = "hivearmor_log_history";
// Local star state for server-saved queries (server has no starred field)
const STARRED_KEY = "hivearmor_saved_starred";

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); }
  catch { return []; }
}

function loadStarred(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(STARRED_KEY) ?? "[]")); }
  catch { return new Set(); }
}

function saveStarred(ids: Set<number>) {
  localStorage.setItem(STARRED_KEY, JSON.stringify(Array.from(ids)));
}

export function saveQueryToHistory(entry: Omit<HistoryEntry, "id">) {
  const history = loadHistory();
  const next: HistoryEntry = { ...entry, id: `h-${Date.now()}` };
  const updated = [next, ...history.filter((h) => h.query !== entry.query)].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

// ── Templates ────────────────────────────────────────────────────────────────

const QUERY_TEMPLATES: { category: string; name: string; query: string; indexPattern: string }[] = [
  {
    category: "Authentication",
    name: "Failed logins (last 1h)",
    query: 'event.action:"authentication_failure" OR event.outcome:"failure"',
    indexPattern: "log-*",
  },
  {
    category: "Authentication",
    name: "Brute force detection",
    query: 'event.action:"authentication_failure" | stats count() by source.ip | where count > 10',
    indexPattern: "log-*",
  },
  {
    category: "Network",
    name: "Suspicious outbound connections",
    query: 'network.direction:"outbound" AND destination.port:(4444 OR 9999 OR 1337 OR 31337)',
    indexPattern: "log-*",
  },
  {
    category: "Network",
    name: "DNS tunneling indicators",
    query: 'dns.question.type:"TXT" OR dns.question.name.length > 50',
    indexPattern: "log-*",
  },
  {
    category: "Endpoint",
    name: "PowerShell execution",
    query: 'process.name:"powershell.exe" AND process.args:("-EncodedCommand" OR "-Bypass")',
    indexPattern: "log-*",
  },
  {
    category: "Endpoint",
    name: "Lateral movement (WMI/PsExec)",
    query: 'event.action:("wmi_execution" OR "psexec") OR process.name:("wmic.exe" OR "psexec.exe")',
    indexPattern: "log-*",
  },
  {
    category: "Threats",
    name: "Critical severity alerts",
    query: 'severity:"critical" OR severity:>=9',
    indexPattern: "alert-*",
  },
  {
    category: "Threats",
    name: "Ransomware indicators",
    query: 'event.category:"malware" AND threat.technique.name:("Data Encrypted for Impact")',
    indexPattern: "log-*",
  },
];

// ── Save dialog ──────────────────────────────────────────────────────────────

interface SaveDialogProps {
  defaultName?: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

function SaveDialog({ defaultName = "", onSave, onCancel }: SaveDialogProps) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim());
    setSaving(false);
  };

  return (
    <div className="px-3 py-3 border-b border-surface-border bg-surface-secondary/50 space-y-2">
      <p className="text-tiny font-medium text-primary">Save query</p>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel(); }}
        placeholder="Query name…"
        className="input-base w-full text-small py-1.5"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-tiny bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1.5 rounded text-tiny text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface LogSavedQueriesProps {
  onLoad: (query: string, indexPattern: string) => void;
  currentQuery?: string;
  currentIndexPattern?: string;
  className?: string;
}

export function LogSavedQueries({ onLoad, currentQuery, currentIndexPattern, className }: LogSavedQueriesProps) {
  const [activeTab, setActiveTab] = useState<"saved" | "history" | "templates">("history");
  const [saved, setSaved] = useState<ServerSavedQuery[]>([]);
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const reloadSaved = useCallback(async () => {
    setLoadingQueries(true);
    try {
      const queries = await logAnalyzerService.listQueries();
      setSaved(queries);
    } finally {
      setLoadingQueries(false);
    }
  }, []);

  const reloadHistory = useCallback(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    setStarred(loadStarred());
    reloadHistory();
  }, [reloadHistory]);

  useEffect(() => {
    if (activeTab === "saved") reloadSaved();
  }, [activeTab, reloadSaved]);

  const handleSaveQuery = async (name: string) => {
    const query = currentQuery ?? "";
    const indexPattern = currentIndexPattern ?? "_v3_hive_*";
    try {
      const existing = saved.find(
        (q) => q.description === query && q.dataOrigin === indexPattern,
      );
      if (existing) {
        if (existing.name !== name) {
          await logAnalyzerService.updateQuery(existing.id, { name, query, indexPattern, owner: existing.owner, creationDate: existing.creationDate });
          toast("success", "Query updated", `Renamed to "${name}"`);
          if (activeTab === "saved") reloadSaved();
        }
        setShowSaveDialog(false);
        return;
      }
      await logAnalyzerService.saveQuery(name, query, indexPattern);
      toast("success", "Query saved", `"${name}" saved to your queries`);
      setShowSaveDialog(false);
      if (activeTab === "saved") reloadSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast("error", "Save failed", msg);
    }
  };

  const handleUpdate = async (id: number, name: string) => {
    const sq = saved.find((q) => q.id === id);
    if (!sq) return;
    try {
      await logAnalyzerService.updateQuery(id, {
        name,
        query: sq.description ?? "",
        indexPattern: sq.dataOrigin ?? "_v3_hive_*",
        owner: sq.owner,
        creationDate: sq.creationDate,
      });
      toast("success", "Query renamed", `"${name}" saved`);
      setSaved((prev) => prev.map((q) => q.id === id ? { ...q, name } : q));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Rename failed";
      toast("error", "Rename failed", msg);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await logAnalyzerService.deleteQuery(id);
      setSaved((prev) => prev.filter((s) => s.id !== id));
      const next = new Set(starred);
      next.delete(id);
      setStarred(next);
      saveStarred(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast("error", "Delete failed", msg);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleStar = (id: number) => {
    const next = new Set(starred);
    if (next.has(id)) next.delete(id); else next.add(id);
    setStarred(next);
    saveStarred(next);
  };

  const deleteHistory = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setHistory(next);
  };

  const clearHistory = () => {
    localStorage.setItem(HISTORY_KEY, "[]");
    setHistory([]);
  };

  const templatesByCategory = QUERY_TEMPLATES.reduce<Record<string, typeof QUERY_TEMPLATES>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const sortedSaved = [...saved].sort((a, b) => {
    const as = starred.has(a.id) ? 1 : 0;
    const bs = starred.has(b.id) ? 1 : 0;
    return bs - as;
  });

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-surface-primary border-l border-surface-border", className)}>
      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0">
        {([
          { key: "history",   icon: <Clock className="w-3.5 h-3.5" />,           label: "History" },
          { key: "saved",     icon: <BookMarked className="w-3.5 h-3.5" />,      label: "Saved" },
          { key: "templates", icon: <LayoutTemplate className="w-3.5 h-3.5" />,  label: "Templates" },
        ] as { key: typeof activeTab; icon: React.ReactNode; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-2.5 text-tiny transition-colors border-b-2",
              activeTab === t.key
                ? "text-primary border-brand"
                : "text-muted border-transparent hover:text-secondary"
            )}
          >
            {t.icon}
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Save current query button (saved tab only) */}
      {activeTab === "saved" && !showSaveDialog && (
        <button
          onClick={() => setShowSaveDialog(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-tiny text-muted hover:text-brand hover:bg-brand-subtle/30 border-b border-surface-border transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          Save current query…
        </button>
      )}
      {activeTab === "saved" && showSaveDialog && (
        <SaveDialog
          defaultName={currentQuery?.slice(0, 60) ?? ""}
          onSave={handleSaveQuery}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {/* History */}
        {activeTab === "history" && (
          <div>
            {history.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border/50">
                <span className="text-tiny text-muted">{history.length} recent queries</span>
                <button onClick={clearHistory} className="text-tiny text-muted hover:text-critical transition-colors">
                  Clear all
                </button>
              </div>
            )}
            {history.length === 0 && (
              <div className="py-8 text-center text-small text-muted px-3">
                No query history yet. Run a search to see it here.
              </div>
            )}
            {history.map((h) => (
              <div key={h.id} className="group px-3 py-2.5 border-b border-surface-border/30 hover:bg-surface-secondary/50 transition-colors">
                <div className="flex items-start gap-2">
                  <button onClick={() => onLoad(h.query, h.indexPattern)} className="flex-1 min-w-0 text-left">
                    <p className="text-tiny text-primary font-mono truncate">{h.query || "(empty)"}</p>
                    <p className="text-tiny text-muted mt-0.5">
                      {h.hits.toLocaleString()} hits · {formatRelativeTime(h.ranAt)} · {h.indexPattern}
                    </p>
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => onLoad(h.query, h.indexPattern)}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand-subtle transition-colors"
                      title="Load query"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteHistory(h.id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Saved */}
        {activeTab === "saved" && (
          <div>
            {loadingQueries && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-small">Loading…</span>
              </div>
            )}
            {!loadingQueries && sortedSaved.length === 0 && (
              <div className="py-8 text-center text-small text-muted px-3">
                No saved queries yet. Use &quot;Save current query&quot; above.
              </div>
            )}
            {!loadingQueries && sortedSaved.map((sq) => (
              <div key={sq.id} className="group px-3 py-2.5 border-b border-surface-border/30 hover:bg-surface-secondary/50 transition-colors">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleStar(sq.id)}
                    className={cn(
                      "shrink-0 mt-0.5 transition-colors",
                      starred.has(sq.id)
                        ? "text-yellow-400"
                        : "text-muted opacity-0 group-hover:opacity-100 hover:text-yellow-400"
                    )}
                  >
                    {starred.has(sq.id)
                      ? <Star className="w-3.5 h-3.5 fill-current" />
                      : <StarOff className="w-3.5 h-3.5" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    {editingId === sq.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="input-base flex-1 min-w-0 text-tiny py-0.5 px-1"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editName.trim()) {
                              handleUpdate(sq.id, editName.trim());
                              setEditingId(null);
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (editName.trim()) handleUpdate(sq.id, editName.trim());
                            setEditingId(null);
                          }}
                          className="text-tiny text-brand hover:text-brand/80 transition-colors shrink-0"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-tiny text-muted hover:text-primary transition-colors shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onLoad(sq.description ?? "", sq.dataOrigin ?? "_v3_hive_*")}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-1">
                          <p className="text-tiny font-medium text-primary truncate">{sq.name}</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(sq.id);
                              setEditName(sq.name);
                            }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-primary"
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-tiny text-muted font-mono truncate mt-0.5">
                          {sq.description || "(no query)"}
                        </p>
                        {sq.creationDate && (
                          <p className="text-tiny text-muted/60 mt-0.5">
                            {formatRelativeTime(sq.creationDate)} · {sq.dataOrigin ?? "_v3_hive_*"}
                          </p>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => onLoad(sq.description ?? "", sq.dataOrigin ?? "_v3_hive_*")}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand-subtle transition-colors"
                      title="Load"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(sq.id)}
                      disabled={deletingId === sq.id}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingId === sq.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />
                      }
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Templates */}
        {activeTab === "templates" && (
          <div>
            {Object.entries(templatesByCategory).map(([cat, templates]) => (
              <div key={cat}>
                <div className="px-3 py-1.5 text-tiny text-muted font-medium uppercase tracking-wider bg-surface-secondary/50 sticky top-0">
                  {cat}
                </div>
                {templates.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => onLoad(t.query, t.indexPattern)}
                    className="w-full text-left px-3 py-2.5 border-b border-surface-border/30 hover:bg-surface-secondary/50 transition-colors group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 text-tiny font-medium text-primary">{t.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-tiny text-muted font-mono truncate mt-0.5">{t.query.slice(0, 60)}…</p>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
