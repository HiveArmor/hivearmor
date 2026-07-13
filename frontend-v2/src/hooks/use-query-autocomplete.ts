"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { elasticService, type IndexField } from "@/services/elastic.service";
import { logAnalyzerService } from "@/services/log-analyzer.service";
import type { SyntaxMode } from "@/components/logs/log-query-bar";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionKind = "field" | "value" | "operator" | "keyword" | "correction";

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  insertText: string;
  detail?: string;
  score?: number;
}

// ── Mode-specific keyword tables ──────────────────────────────────────────────

const KQL_OPERATORS: Suggestion[] = [
  { kind: "operator", label: "AND", insertText: "AND ",  detail: "conjunction" },
  { kind: "operator", label: "OR",  insertText: "OR ",   detail: "conjunction" },
  { kind: "operator", label: "NOT", insertText: "NOT ",  detail: "negation" },
];

const LUCENE_OPERATORS: Suggestion[] = [
  { kind: "operator", label: "AND",  insertText: "AND ",  detail: "conjunction" },
  { kind: "operator", label: "OR",   insertText: "OR ",   detail: "conjunction" },
  { kind: "operator", label: "NOT",  insertText: "NOT ",  detail: "negation" },
  { kind: "operator", label: "AND NOT", insertText: "AND NOT ", detail: "exclusion" },
];

// Shown after "field:" in Lucene mode as structural templates
const LUCENE_VALUE_PREFIXES: Suggestion[] = [
  { kind: "operator", label: "[x TO y]",  insertText: "[",  detail: "inclusive range" },
  { kind: "operator", label: "{x TO y}",  insertText: "{",  detail: "exclusive range" },
  { kind: "operator", label: ">= value",  insertText: ">=", detail: "gte" },
  { kind: "operator", label: "> value",   insertText: ">",  detail: "gt" },
  { kind: "operator", label: "<= value",  insertText: "<=", detail: "lte" },
  { kind: "operator", label: "< value",   insertText: "<",  detail: "lt" },
];

// Shown after a complete "field:value" in Lucene (fuzzy, boost)
const LUCENE_SUFFIX_OPS: Suggestion[] = [
  { kind: "operator", label: "~2 (fuzzy)",  insertText: "~2 ", detail: "fuzzy distance" },
  { kind: "operator", label: "~1 (fuzzy)",  insertText: "~1 ", detail: "fuzzy distance" },
  { kind: "operator", label: "^2 (boost)",  insertText: "^2 ", detail: "relevance boost" },
  { kind: "operator", label: "^5 (boost)",  insertText: "^5 ", detail: "relevance boost" },
];

const SQL_KEYWORDS: Suggestion[] = [
  { kind: "keyword", label: "SELECT",   insertText: "SELECT ",   detail: "sql" },
  { kind: "keyword", label: "FROM",     insertText: "FROM ",     detail: "sql" },
  { kind: "keyword", label: "WHERE",    insertText: "WHERE ",    detail: "sql" },
  { kind: "keyword", label: "LIMIT",    insertText: "LIMIT ",    detail: "sql" },
  { kind: "keyword", label: "ORDER BY", insertText: "ORDER BY ", detail: "sql" },
  { kind: "keyword", label: "GROUP BY", insertText: "GROUP BY ", detail: "sql" },
  { kind: "keyword", label: "AND",      insertText: "AND ",      detail: "sql" },
  { kind: "keyword", label: "OR",       insertText: "OR ",       detail: "sql" },
  { kind: "keyword", label: "NOT",      insertText: "NOT ",      detail: "sql" },
];

// Shown after a field name in SQL WHERE context
const SQL_COMPARISON_OPS: Suggestion[] = [
  { kind: "operator", label: "=",        insertText: "= ",       detail: "equals" },
  { kind: "operator", label: "!=",       insertText: "!= ",      detail: "not equals" },
  { kind: "operator", label: "LIKE",     insertText: "LIKE ",    detail: "pattern match" },
  { kind: "operator", label: "NOT LIKE", insertText: "NOT LIKE ", detail: "pattern exclude" },
  { kind: "operator", label: "IN",       insertText: "IN (",     detail: "value list" },
  { kind: "operator", label: "NOT IN",   insertText: "NOT IN (", detail: "exclude list" },
  { kind: "operator", label: "BETWEEN",  insertText: "BETWEEN ", detail: "range" },
  { kind: "operator", label: "IS NULL",  insertText: "IS NULL",  detail: "null check" },
  { kind: "operator", label: "IS NOT NULL", insertText: "IS NOT NULL", detail: "not null" },
  { kind: "operator", label: ">",        insertText: "> ",       detail: "greater than" },
  { kind: "operator", label: ">=",       insertText: ">= ",      detail: "gte" },
  { kind: "operator", label: "<",        insertText: "< ",       detail: "less than" },
  { kind: "operator", label: "<=",       insertText: "<= ",      detail: "lte" },
];

// ── Levenshtein ───────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// ── Parser ────────────────────────────────────────────────────────────────────

interface ParsedCursor {
  tokenBefore: string;
  isAfterColon: boolean;
  fieldName: string | null;
  isAfterValue: boolean;
  tokenStart: number;
  // Lucene: cursor at end of "field:value" token (no trailing space) → suggest ~, ^
  isLuceneValueEnd: boolean;
  // SQL: cursor is after a field token in WHERE/AND/OR context → suggest comparison ops
  isSqlComparison: boolean;
  sqlComparisonField: string | null;
  // SQL: cursor is after FROM keyword → suggest index patterns
  isSqlAfterFrom: boolean;
}

function parseCursor(text: string, cursor: number, mode: SyntaxMode): ParsedCursor {
  const before = text.slice(0, cursor);

  const tokenMatch = before.match(/([^\s()]+)$/);
  const tokenBefore = tokenMatch ? tokenMatch[1] : "";
  const tokenStart  = cursor - tokenBefore.length;

  // Check for colon within current token
  const colonIdx = tokenBefore.indexOf(":");
  if (colonIdx !== -1) {
    const fieldName   = tokenBefore.slice(0, colonIdx);
    const valuePrefix = tokenBefore.slice(colonIdx + 1);
    return {
      tokenBefore: valuePrefix,
      isAfterColon: true,
      fieldName,
      isAfterValue: false,
      tokenStart: tokenStart + colonIdx + 1,
      isLuceneValueEnd: false,
      isSqlComparison: false,
      sqlComparisonField: null,
      isSqlAfterFrom: false,
    };
  }

  // After a complete field:value pair
  const prevTokenMatch = before.slice(0, tokenStart).match(/(\S+:\S+)\s+$/);
  const isAfterValue = !!prevTokenMatch;

  // Lucene: cursor immediately after field:value with NO space yet → cursor was just at end
  // This means the full token IS "field:value" — check the char before cursor is not space
  // and the token contains a colon with a value part
  const prevFullToken = before.match(/(\S+:\S+)$/);
  const isLuceneValueEnd =
    mode === "lucene" &&
    !tokenBefore &&
    !!prevFullToken &&
    prevFullToken[1].includes(":");

  // SQL: after FROM → suggest index patterns
  const isSqlAfterFrom =
    mode === "sql" &&
    /\bFROM\s+$/i.test(before);

  // SQL: after a field name in WHERE/AND/OR/ON context → suggest comparison operators
  // Pattern: (WHERE|AND|OR|,)\s+<word>\s+$ where <word> looks like a field name (no colon)
  let isSqlComparison = false;
  let sqlComparisonField: string | null = null;
  if (mode === "sql" && !tokenBefore) {
    const sqlFieldCtx = before.match(/(?:WHERE|AND|OR|ON)\s+([\w.]+)\s+$/i);
    if (sqlFieldCtx) {
      isSqlComparison = true;
      sqlComparisonField = sqlFieldCtx[1];
    }
  }

  return {
    tokenBefore,
    isAfterColon: false,
    fieldName: null,
    isAfterValue,
    tokenStart,
    isLuceneValueEnd,
    isSqlComparison,
    sqlComparisonField,
    isSqlAfterFrom,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const FIELD_CACHE = new Map<string, IndexField[]>();
const VALUE_CACHE = new Map<string, string[]>();

export function useQueryAutocomplete(
  query: string,
  cursorPos: number,
  indexPattern: string,
  syntaxMode: SyntaxMode,
  enabled: boolean,
) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fields, setFields] = useState<IndexField[]>([]);
  const fetchingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load field mapping
  useEffect(() => {
    if (!indexPattern) return;
    if (FIELD_CACHE.has(indexPattern)) {
      setFields(FIELD_CACHE.get(indexPattern)!);
      return;
    }
    elasticService.getIndexFields(indexPattern).then((f) => {
      FIELD_CACHE.set(indexPattern, f);
      setFields(f);
    });
  }, [indexPattern]);

  // Build suggestions
  useEffect(() => {
    if (!enabled || fields.length === 0) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const parsed = parseCursor(query, cursorPos, syntaxMode);

      // ── SQL: after FROM → index patterns ────────────────────────────────
      if (parsed.isSqlAfterFrom) {
        // We don't have indexPatterns list here, but we can suggest the current one
        // and a few common wildcards as hints
        const hints: Suggestion[] = [
          { kind: "keyword", label: indexPattern, insertText: indexPattern + " ", detail: "current index" },
          { kind: "keyword", label: "logs-*",     insertText: "logs-* ",     detail: "wildcard" },
          { kind: "keyword", label: "*",           insertText: "* ",          detail: "all indices" },
        ];
        setSuggestions(hints);
        setActiveIndex(0);
        return;
      }

      // ── SQL: after field name in WHERE → comparison operators ───────────
      if (parsed.isSqlComparison) {
        setSuggestions(SQL_COMPARISON_OPS);
        setActiveIndex(0);
        return;
      }

      // ── Lucene: cursor at end of "field:value" → fuzzy/boost suffixes ───
      if (parsed.isLuceneValueEnd) {
        setSuggestions(LUCENE_SUFFIX_OPS);
        setActiveIndex(0);
        return;
      }

      // ── After "field:" → value suggestions ──────────────────────────────
      if (parsed.isAfterColon && parsed.fieldName) {
        // Lucene: if value prefix is empty, prepend range/comparison operators
        if (syntaxMode === "lucene" && !parsed.tokenBefore) {
          const cacheKey = `${indexPattern}::${parsed.fieldName}`;
          let values: string[] = [];
          if (VALUE_CACHE.has(cacheKey)) {
            values = VALUE_CACHE.get(cacheKey)!;
          } else if (!fetchingRef.current) {
            fetchingRef.current = true;
            try {
              const res = await logAnalyzerService.getTopValues(parsed.fieldName, indexPattern, [], 8);
              values = res.top.map((t) => String(t.value));
            } catch { values = []; }
            finally { fetchingRef.current = false; }
            VALUE_CACHE.set(cacheKey, values);
          }
          const valueSuggs: Suggestion[] = values.slice(0, 5).map((v) => ({
            kind: "value",
            label: v,
            insertText: v,
            detail: parsed.fieldName ?? undefined,
          }));
          setSuggestions([...LUCENE_VALUE_PREFIXES, ...valueSuggs].slice(0, 12));
          setActiveIndex(0);
          return;
        }

        // KQL / Lucene with partial value / SQL (shouldn't reach here but safe)
        const cacheKey = `${indexPattern}::${parsed.fieldName}`;
        let values: string[];

        if (VALUE_CACHE.has(cacheKey)) {
          values = VALUE_CACHE.get(cacheKey)!;
        } else if (!fetchingRef.current) {
          fetchingRef.current = true;
          try {
            const res = await logAnalyzerService.getTopValues(parsed.fieldName, indexPattern, [], 10);
            values = res.top.map((t) => String(t.value));
          } catch { values = []; }
          finally { fetchingRef.current = false; }
          VALUE_CACHE.set(cacheKey, values);
        } else {
          return;
        }

        const prefix = parsed.tokenBefore.toLowerCase();
        const filtered = values
          .filter((v) => !prefix || v.toLowerCase().startsWith(prefix))
          .slice(0, 8)
          .map<Suggestion>((v) => ({
            kind: "value",
            label: v,
            insertText: v,
            detail: parsed.fieldName ?? undefined,
          }));
        setSuggestions(filtered);
        setActiveIndex(0);
        return;
      }

      // ── After a complete "field:value " → boolean/conjunction operators ──
      if (parsed.isAfterValue) {
        const ops =
          syntaxMode === "lucene" ? LUCENE_OPERATORS :
          syntaxMode === "sql"    ? SQL_KEYWORDS.filter((k) => ["AND","OR","NOT"].includes(k.label)) :
          KQL_OPERATORS;
        setSuggestions(ops);
        setActiveIndex(0);
        return;
      }

      const token = parsed.tokenBefore;
      if (!token) { setSuggestions([]); return; }

      const tokenLower = token.toLowerCase();

      // ── SQL mode: keywords + fields ──────────────────────────────────────
      if (syntaxMode === "sql") {
        const kwMatches = SQL_KEYWORDS.filter((k) =>
          k.label.toLowerCase().startsWith(tokenLower)
        );
        const fieldMatches = fields
          .filter((f) => f.name.toLowerCase().includes(tokenLower))
          .slice(0, 6)
          .map<Suggestion>((f) => ({
            kind: "field",
            label: f.name,
            insertText: f.name,   // no colon in SQL
            detail: f.type,
          }));
        setSuggestions([...kwMatches, ...fieldMatches].slice(0, 10));
        setActiveIndex(0);
        return;
      }

      // ── KQL / Lucene: operator keywords ─────────────────────────────────
      const opList = syntaxMode === "lucene" ? LUCENE_OPERATORS : KQL_OPERATORS;
      const opMatches = opList.filter((k) =>
        k.label.toLowerCase().startsWith(tokenLower)
      );

      // ── Field name matches ────────────────────────────────────────────────
      const exactMatches  = fields.filter((f) => f.name.toLowerCase().startsWith(tokenLower));
      const containsMatches = fields.filter((f) =>
        f.name.toLowerCase().includes(tokenLower) && !f.name.toLowerCase().startsWith(tokenLower)
      );
      const allFieldMatches = [...exactMatches, ...containsMatches]
        .slice(0, 8)
        .map<Suggestion>((f) => ({
          kind: "field",
          label: f.name,
          insertText: f.name + ":",   // colon for KQL and Lucene
          detail: f.type,
        }));

      // ── Corrections via Levenshtein ───────────────────────────────────────
      const corrections: Suggestion[] = [];
      if (allFieldMatches.length === 0 && token.length > 3 && !opMatches.length) {
        const closest = fields
          .map((f) => ({ f, dist: levenshtein(tokenLower, f.name.toLowerCase()) }))
          .filter(({ dist }) => dist <= 3)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);
        corrections.push(...closest.map<Suggestion>(({ f }) => ({
          kind: "correction",
          label: f.name,
          insertText: f.name + ":",
          detail: `did you mean "${f.name}"?`,
        })));
      }

      setSuggestions([...opMatches, ...allFieldMatches, ...corrections].slice(0, 10));
      setActiveIndex(0);
    }, 120);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cursorPos, fields, indexPattern, syntaxMode, enabled]);

  useEffect(() => { setActiveIndex(0); }, [suggestions.length]);

  const dismiss   = useCallback(() => setSuggestions([]), []);
  const moveUp    = useCallback(() => setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1)), [suggestions.length]);
  const moveDown  = useCallback(() => setActiveIndex((i) => (i >= suggestions.length - 1 ? 0 : i + 1)), [suggestions.length]);
  const setActive = useCallback((i: number) => setActiveIndex(i), []);

  const accept = useCallback((
    suggestion: Suggestion,
    currentQuery: string,
    cursorPosition: number,
  ): { newQuery: string; newCursor: number } => {
    const parsed = parseCursor(currentQuery, cursorPosition, syntaxMode);
    const before = currentQuery.slice(0, parsed.tokenStart);
    const after  = currentQuery.slice(cursorPosition);
    const insert = suggestion.insertText;
    const suffix = suggestion.kind === "value" && !after.startsWith(" ") ? " " : "";
    const newQuery  = before + insert + suffix + after;
    const newCursor = before.length + insert.length + suffix.length;
    return { newQuery, newCursor };
  }, [syntaxMode]);

  return {
    suggestions,
    activeIndex,
    dismiss,
    moveUp,
    moveDown,
    setActive,
    accept,
    hasSuggestions: suggestions.length > 0,
  };
}
