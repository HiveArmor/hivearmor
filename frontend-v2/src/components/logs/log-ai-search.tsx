"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, ArrowRight, X, Info, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { socAiService, type NlQueryResult, type NlQuerySuggestedFilter } from "@/services/soc-ai.service";

interface LogAiSearchProps {
  indexPattern: string;
  onApplyQuery: (dslQuery: string, explanation: string) => void;
  onAddFilter: (field: string, value: string) => void;
  onClose: () => void;
  className?: string;
}

export function LogAiSearch({
  indexPattern,
  onApplyQuery,
  onAddFilter,
  onClose,
  className,
}: LogAiSearchProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NlQueryResult | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setShowExplanation(false);

    try {
      const res = await socAiService.nlQuery({
        question: q,
        indexPattern: indexPattern || undefined,
      });

      if (res === null) {
        setError("AI service is unavailable. Check the SOC-AI plugin configuration.");
        return;
      }
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query translation failed");
    } finally {
      setLoading(false);
    }
  }, [question, indexPattern, loading]);

  const handleApply = useCallback(() => {
    if (!result) return;
    const queryStr = JSON.stringify(result.query, null, 2);
    onApplyQuery(queryStr, result.explanation ?? "");
    onClose();
  }, [result, onApplyQuery, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className={cn("flex flex-col gap-3 p-3 bg-surface-secondary border border-brand/20 rounded-lg shadow-lg animate-scale-in", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-brand-accent shrink-0" />
        <span className="text-small font-medium text-primary">Ask AI</span>
        <span className="text-tiny text-muted">Describe what you&apos;re looking for in plain English</span>
        <button
          onClick={onClose}
          className="ml-auto text-muted hover:text-primary transition-colors"
          title="Close AI search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Show me failed logins from Russia in the last hour..."
          rows={2}
          autoFocus
          className={cn(
            "w-full resize-none rounded border bg-surface-primary px-3 py-2 text-small text-primary placeholder:text-muted",
            "outline-none transition-all font-mono",
            "border-surface-border focus:border-brand/50 focus:ring-1 focus:ring-brand/15"
          )}
          spellCheck={false}
        />
        <button
          onClick={handleSubmit}
          disabled={!question.trim() || loading}
          className={cn(
            "absolute right-2 bottom-2 flex items-center gap-1 px-2 py-1 rounded text-tiny font-semibold transition-all",
            "bg-brand text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          title="Translate to query (⌘↵)"
        >
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <ArrowRight className="w-3 h-3" />}
          {loading ? "Thinking…" : "Translate"}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded bg-critical/10 border border-critical/20 text-tiny text-critical">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="flex flex-col gap-2">
          {/* Generated query preview */}
          <div className="rounded border border-surface-border bg-surface-primary overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surface-border/50 bg-surface-secondary/50">
              <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
              <span className="text-tiny text-secondary flex-1">Generated OpenSearch DSL query</span>
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="flex items-center gap-1 text-tiny text-muted hover:text-primary transition-colors"
                title="Toggle explanation"
              >
                <Info className="w-3 h-3" />
                <span>Explain</span>
              </button>
            </div>
            <pre className="px-3 py-2 text-[11px] font-mono text-primary/80 overflow-x-auto max-h-[120px] overflow-y-auto leading-5">
              {JSON.stringify(result.query, null, 2)}
            </pre>
          </div>

          {/* Explanation */}
          {showExplanation && result.explanation && (
            <div className="flex items-start gap-2 px-3 py-2 rounded bg-brand-subtle/30 border border-brand/10 text-tiny text-secondary">
              <Sparkles className="w-3 h-3 text-brand-accent shrink-0 mt-0.5" />
              <span>{result.explanation}</span>
            </div>
          )}

          {/* Suggested filter chips */}
          {result.suggestedFilters && result.suggestedFilters.length > 0 && (
            <SuggestedFilters
              filters={result.suggestedFilters}
              onAdd={onAddFilter}
            />
          )}

          {/* Apply button */}
          <button
            onClick={handleApply}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded text-small font-semibold bg-brand text-white hover:bg-brand-hover transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Apply query to search bar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Suggested filter chips ────────────────────────────────────────────────────

function SuggestedFilters({
  filters,
  onAdd,
}: {
  filters: NlQuerySuggestedFilter[];
  onAdd: (field: string, value: string) => void;
}) {
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const handleChip = (f: NlQuerySuggestedFilter) => {
    const key = `${f.field}:${f.value}`;
    if (applied.has(key)) return;
    setApplied((prev) => new Set(prev).add(key));
    onAdd(f.field, f.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-tiny text-muted shrink-0">Suggested:</span>
      {filters.map((f) => {
        const key = `${f.field}:${f.value}`;
        const done = applied.has(key);
        return (
          <button
            key={key}
            onClick={() => handleChip(f)}
            disabled={done}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-tiny border transition-all",
              done
                ? "bg-success/10 border-success/30 text-success cursor-default"
                : "bg-brand-subtle border-brand/20 text-brand hover:bg-brand/20 hover:border-brand/40"
            )}
            title={`Add filter: ${f.field} = ${f.value}`}
          >
            {done && <CheckCircle2 className="w-3 h-3" />}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

// ── AI badge shown when a query was applied from NL mode ──────────────────────

interface AiQueryBadgeProps {
  explanation: string;
  onClear: () => void;
}

export function AiQueryBadge({ explanation, onClear }: AiQueryBadgeProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="relative flex items-center">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny bg-brand-subtle border border-brand/20 text-brand">
        <Sparkles className="w-3 h-3 shrink-0" />
        AI-generated
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="opacity-60 hover:opacity-100 transition-opacity"
          title="Show AI explanation"
        >
          <Info className="w-3 h-3" />
        </button>
        <button
          onClick={onClear}
          className="opacity-60 hover:opacity-100 transition-opacity hover:text-critical"
          title="Clear AI query"
        >
          <X className="w-3 h-3" />
        </button>
      </span>

      {showExplanation && explanation && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 px-3 py-2 rounded-lg bg-surface-elevated border border-brand/20 shadow-dropdown text-tiny text-secondary animate-scale-in">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3 h-3 text-brand-accent shrink-0 mt-0.5" />
            <span>{explanation}</span>
          </div>
        </div>
      )}
    </div>
  );
}
