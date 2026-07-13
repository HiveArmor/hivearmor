"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  Play, Sparkles, ChevronDown, RefreshCw, AlertCircle,
  Code2, Database, Zap, ChevronsUpDown, X, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryAutocomplete, type Suggestion } from "@/hooks/use-query-autocomplete";
import { QuerySuggestionList } from "@/components/logs/query-suggestion-list";
import { validateQuery } from "@/lib/query-validators";

type SyntaxMode = "kql" | "lucene" | "sql";

const SYNTAX_MODES: { value: SyntaxMode; label: string; icon: React.ReactNode }[] = [
  { value: "kql",    label: "KQL",    icon: <Zap className="w-3 h-3" /> },
  { value: "lucene", label: "Lucene", icon: <Code2 className="w-3 h-3" /> },
  { value: "sql",    label: "SQL",    icon: <Database className="w-3 h-3" /> },
];

const KQL_PLACEHOLDERS: Record<SyntaxMode, string> = {
  kql:    'Search… e.g. severity:"critical" AND source.ip:"10.0.*"',
  lucene: 'Search… e.g. event.action:"login_failed" AND severity:>=3',
  sql:    "SELECT * FROM logs WHERE severity >= 3 LIMIT 500",
};

interface LogQueryBarProps {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  running?: boolean;
  error?: string | null;
  indexPattern: string;
  indexPatterns: { id: number; pattern: string }[];
  onIndexChange: (p: string) => void;
  syntaxMode: SyntaxMode;
  onSyntaxChange: (m: SyntaxMode) => void;
  className?: string;
}

export function LogQueryBar({
  value,
  onChange,
  onRun,
  running,
  error,
  indexPattern,
  indexPatterns,
  onIndexChange,
  syntaxMode,
  onSyntaxChange,
  className,
}: LogQueryBarProps) {
  const [indexOpen, setIndexOpen] = useState(false);
  const [syntaxOpen, setSyntaxOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [inputCursor, setInputCursor] = useState(() => value.length);
  const [textareaCursor, setTextareaCursor] = useState(() => value.length);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autocomplete — active when either input or textarea is focused
  const acEnabled = inputFocused || textareaFocused;
  const activeCursor = editorOpen ? textareaCursor : inputCursor;

  const ac = useQueryAutocomplete(value, activeCursor, indexPattern, syntaxMode, acEnabled);

  // Validate current query on every change; prefer validation errors over run errors in UI
  const validationErrors = useMemo(() => {
    if (!value.trim()) return [];
    return validateQuery(value, syntaxMode).errors;
  }, [value, syntaxMode]);

  const displayError = validationErrors.length > 0
    ? validationErrors.map((e) => e.message).join(" · ")
    : error ?? null;

  const handleRun = useCallback(() => {
    ac.dismiss();
    setEditorOpen(false);
    onRun();
  }, [onRun, ac]);

  const openEditor = useCallback(() => {
    setEditorOpen(true);
    setIndexOpen(false);
    setSyntaxOpen(false);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      // Place cursor at end so suggestions fire on the current token
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
      setTextareaCursor(end);
      setTextareaFocused(true);
    }, 0);
  }, []);

  // Accept a suggestion from either context
  const handleAccept = useCallback((suggestion: Suggestion) => {
    const el = editorOpen ? textareaRef.current : inputRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const { newQuery, newCursor } = ac.accept(suggestion, value, cursor);
    onChange(newQuery);
    ac.dismiss();
    // Restore cursor after React re-render
    setTimeout(() => {
      if (editorOpen && textareaRef.current) {
        textareaRef.current.setSelectionRange(newCursor, newCursor);
        setTextareaCursor(newCursor);
      } else if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursor, newCursor);
        setInputCursor(newCursor);
      }
    }, 0);
  }, [ac, editorOpen, value, onChange]);

  // Close overlay on outside click
  useEffect(() => {
    if (!editorOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        overlayRef.current && !overlayRef.current.contains(e.target as Node) &&
        containerRef.current && !containerRef.current.contains(e.target as Node)
      ) {
        setEditorOpen(false);
        ac.dismiss();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editorOpen, ac]);

  const [indexSearch, setIndexSearch] = useState("");
  const indexSearchRef = useRef<HTMLInputElement>(null);

  const currentSyntax = SYNTAX_MODES.find((m) => m.value === syntaxMode)!;
  const hasQuery = value.trim().length > 0;

  const allIndexPatterns = useMemo(
    () => indexPatterns.map((ip) => ip.pattern),
    [indexPatterns]
  );

  const filteredIndexPatterns = useMemo(() => {
    const q = indexSearch.trim().toLowerCase();
    return q ? allIndexPatterns.filter((p) => p.toLowerCase().includes(q)) : allIndexPatterns;
  }, [allIndexPatterns, indexSearch]);

  const openIndexDropdown = useCallback(() => {
    setIndexOpen(true);
    setSyntaxOpen(false);
    setEditorOpen(false);
    setIndexSearch("");
    ac.dismiss();
    setTimeout(() => indexSearchRef.current?.focus(), 0);
  }, [ac]);

  // Shared keydown handler for both input and textarea
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (ac.hasSuggestions) {
      if (e.key === "ArrowDown") { e.preventDefault(); ac.moveDown(); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); ac.moveUp();   return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !editorOpen)) {
        e.preventDefault();
        handleAccept(ac.suggestions[ac.activeIndex]);
        return;
      }
      if (e.key === "Enter" && editorOpen && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAccept(ac.suggestions[ac.activeIndex]);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); ac.dismiss(); return; }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleRun(); return; }
    if (!editorOpen && e.key === "Enter") { handleRun(); return; }
    if (e.key === "Escape" && editorOpen) { e.preventDefault(); setEditorOpen(false); }
  }, [ac, editorOpen, handleAccept, handleRun]);

  return (
    <div ref={containerRef} className={cn("relative flex items-center gap-1.5 min-w-0", className)}>

      {/* ── Index pattern combobox ── */}
      <div className="relative shrink-0">
        <button
          onClick={() => indexOpen ? setIndexOpen(false) : openIndexDropdown()}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border text-tiny font-mono h-7 transition-all",
            "bg-surface-secondary border-surface-border text-secondary hover:text-primary hover:border-brand/40",
            indexOpen && "border-brand/50 text-primary bg-brand-subtle/20"
          )}
        >
          <Database className="w-3 h-3 text-brand shrink-0" />
          <span className="max-w-[88px] truncate">{indexPattern}</span>
          <ChevronDown className={cn("w-2.5 h-2.5 shrink-0 opacity-50 transition-transform", indexOpen && "rotate-180")} />
        </button>
        {indexOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIndexOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 w-52 card shadow-dropdown animate-scale-in flex flex-col">
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-surface-border/50">
                <Search className="w-3 h-3 text-muted shrink-0" />
                <input
                  ref={indexSearchRef}
                  type="text"
                  value={indexSearch}
                  onChange={(e) => setIndexSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setIndexOpen(false);
                    if (e.key === "Enter" && filteredIndexPatterns.length === 1) {
                      onIndexChange(filteredIndexPatterns[0]);
                      setIndexOpen(false);
                    }
                  }}
                  placeholder="Filter patterns…"
                  className="flex-1 min-w-0 bg-transparent text-tiny text-primary placeholder:text-muted outline-none font-mono"
                  autoComplete="off"
                />
                {indexSearch && (
                  <button onClick={() => setIndexSearch("")} className="text-muted hover:text-primary">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="max-h-[280px] overflow-y-auto py-1">
                {filteredIndexPatterns.length === 0 ? (
                  <p className="px-2.5 py-2 text-tiny text-muted text-center">No patterns match</p>
                ) : (
                  filteredIndexPatterns.map((p) => (
                    <button
                      key={p}
                      onClick={() => { onIndexChange(p); setIndexOpen(false); }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 text-tiny font-mono transition-colors",
                        indexPattern === p ? "text-brand bg-brand-subtle" : "text-secondary hover:bg-surface-tertiary"
                      )}
                    >
                      {p}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Single-line input (collapsed state) ── */}
      <div
        className={cn(
          "flex-1 min-w-0 flex items-center gap-1.5 h-7 px-2.5 rounded border transition-all cursor-text group/bar",
          "bg-surface-secondary border-surface-border",
          editorOpen
            ? "border-brand/50 ring-1 ring-brand/15 bg-surface-tertiary"
            : "hover:border-surface-border-focus",
          displayError && !editorOpen && "border-critical/40"
        )}
        onClick={openEditor}
      >
        <span className={cn("text-tiny shrink-0", hasQuery ? "text-brand" : "text-muted")}>
          {currentSyntax.icon}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setInputCursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => setInputCursor((e.target as HTMLInputElement).selectionStart ?? value.length)}
          onClick={(e) => setInputCursor((e.target as HTMLInputElement).selectionStart ?? value.length)}
          onFocus={(e) => {
            setInputFocused(true);
            setInputCursor(e.target.selectionStart ?? value.length);
            openEditor();
          }}
          onBlur={() => setInputFocused(false)}
          placeholder={KQL_PLACEHOLDERS[syntaxMode]}
          className="flex-1 min-w-0 bg-transparent text-tiny text-primary placeholder:text-muted outline-none font-mono"
          spellCheck={false}
          autoComplete="off"
        />
        {hasQuery && (
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(""); ac.dismiss(); }}
            className="shrink-0 opacity-0 group-hover/bar:opacity-100 transition-opacity text-muted hover:text-critical"
            title="Clear"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); void (editorOpen ? setEditorOpen(false) : openEditor()); }}
          className="shrink-0 text-muted hover:text-primary transition-colors opacity-0 group-hover/bar:opacity-100"
          title="Expand editor"
        >
          <ChevronsUpDown className="w-3 h-3" />
        </button>
      </div>

      {/* ── Syntax mode ── */}
      <div className="relative shrink-0">
        <button
          onClick={() => { setSyntaxOpen(!syntaxOpen); setIndexOpen(false); }}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded border text-tiny h-7 transition-all",
            "bg-surface-secondary border-surface-border text-secondary hover:text-primary hover:border-brand/40",
            syntaxOpen && "border-brand/50 text-primary"
          )}
        >
          {currentSyntax.icon}
          <span className="hidden sm:inline">{currentSyntax.label}</span>
          <ChevronDown className={cn("w-2.5 h-2.5 opacity-50 transition-transform", syntaxOpen && "rotate-180")} />
        </button>
        {syntaxOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSyntaxOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-28 card shadow-dropdown py-1 animate-scale-in">
              {SYNTAX_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => { onSyntaxChange(m.value); setSyntaxOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-tiny transition-colors",
                    syntaxMode === m.value ? "text-brand bg-brand-subtle" : "text-secondary hover:bg-surface-tertiary"
                  )}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── AI assist ── */}
      <button
        className="shrink-0 flex items-center gap-1 px-2 py-1 h-7 rounded border border-surface-border bg-surface-secondary text-tiny text-secondary hover:text-primary hover:border-brand/40 transition-all"
        title="AI query assist (coming soon)"
      >
        <Sparkles className="w-3 h-3 text-brand-accent" />
        <span className="hidden lg:inline">AI</span>
      </button>

      {/* ── Run ── */}
      <button
        onClick={handleRun}
        disabled={running}
        className={cn(
          "shrink-0 flex items-center gap-1.5 px-3 py-1 h-7 rounded text-tiny font-semibold transition-all",
          "bg-brand text-white hover:bg-brand-hover disabled:opacity-60",
          running && "animate-pulse"
        )}
      >
        {running
          ? <RefreshCw className="w-3 h-3 animate-spin" />
          : <Play className="w-3 h-3" />}
        <span>{running ? "Running" : "Run"}</span>
        <kbd className="hidden sm:inline text-[10px] opacity-60 font-normal ml-0.5">⌘↵</kbd>
      </button>

      {/* ── Expanded editor overlay ── */}
      {editorOpen && (
        <div
          ref={overlayRef}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-lg overflow-visible animate-scale-in"
          style={{
            background: "#0d1117",
            border: "1px solid rgba(var(--color-brand-rgb, 99 102 241) / 0.3)",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.4), 0 16px 48px -4px rgba(0,0,0,0.6)",
          }}
        >
          {/* Overlay header */}
          <div className="flex items-center gap-2 px-3 h-8 bg-[#161b22] border-b border-white/5 rounded-t-lg">
            <span className="text-tiny font-mono text-muted/70">{indexPattern}</span>
            <span className="text-tiny text-muted/40">·</span>
            <span className="text-tiny text-muted/70">{currentSyntax.label}</span>
            <div className="flex-1" />
            <span className="text-[10px] text-muted/40 font-mono">↑↓ navigate · ↵/Tab accept · esc dismiss · ⌘↵ run</span>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleRun(); }}
              disabled={running}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-brand/90 text-white hover:bg-brand transition-colors disabled:opacity-50"
            >
              {running ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              Run
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setTextareaCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => setTextareaCursor((e.target as HTMLTextAreaElement).selectionStart ?? value.length)}
            onClick={(e) => setTextareaCursor((e.target as HTMLTextAreaElement).selectionStart ?? value.length)}
            onFocus={(e) => {
              setTextareaFocused(true);
              setTextareaCursor(e.target.selectionStart ?? value.length);
            }}
            onBlur={() => setTextareaFocused(false)}
            placeholder={KQL_PLACEHOLDERS[syntaxMode]}
            rows={4}
            className="w-full bg-transparent text-[13px] leading-6 text-[#e6edf3] font-mono p-3 resize-none outline-none placeholder:text-white/20"
            spellCheck={false}
            autoComplete="off"
          />

          {/* Autocomplete suggestions inside overlay */}
          {ac.hasSuggestions && textareaFocused && (
            <div className="px-2 pb-2">
              <QuerySuggestionList
                suggestions={ac.suggestions}
                activeIndex={ac.activeIndex}
                onAccept={handleAccept}
                onSetActive={ac.setActive}
                className="w-full"
              />
            </div>
          )}

          {/* Error strip */}
          {displayError && !ac.hasSuggestions && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-critical/10 border-t border-critical/20 text-tiny text-critical rounded-b-lg">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate">{displayError}</span>
              {validationErrors.length > 0 && (
                <span className="shrink-0 text-[10px] text-critical/60 font-mono ml-auto">syntax</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Autocomplete below compact bar (overlay closed, input focused) ── */}
      {!editorOpen && ac.hasSuggestions && inputFocused && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50">
          <QuerySuggestionList
            suggestions={ac.suggestions}
            activeIndex={ac.activeIndex}
            onAccept={handleAccept}
            onSetActive={ac.setActive}
          />
        </div>
      )}

      {/* ── Inline error (overlay closed, no suggestions) ── */}
      {displayError && !editorOpen && !ac.hasSuggestions && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-critical/10 border border-critical/30 text-tiny text-critical animate-scale-in">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="font-mono truncate">{displayError}</span>
          {validationErrors.length > 0 && (
            <span className="shrink-0 text-[10px] text-critical/60 font-mono ml-auto">syntax</span>
          )}
        </div>
      )}
    </div>
  );
}

export type { SyntaxMode };
