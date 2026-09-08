import type { HuntCrosstabResponse, HuntPivotConfig } from '../searchHunt.types';

/**
 * P5 PR 1 — the §30 reproduction context for a Pivot → Detection candidate.
 *
 * <p>This is EVIDENCE, not a screenshot: the full, reproducible description of the selected combination so a
 * SOC manager can review (and, in a later PR, an agent can draft a rule from) exactly what the analyst saw.
 * PR 1 only CAPTURES this — it drafts no rule, calls no LLM, writes nothing to the backend, and cannot reach
 * any deploy path. The governed drafting/approval flow is a separate, later PR.
 */
export interface PivotDetectionContext {
  searchId: string | null;
  computedAt: string | null;
  query: string;
  rowField: string;
  colField: string;
  measure: { function: string; distinctField: string | null };
  pivotFilters: string[];
  selectedCell: { row: string; col: string; value: number };
  /** True when P4 flagged this cell as a significant combination — carried through for reviewer context. */
  significant?: { residual: number; expected: number; ratio: number; direction: 'over' | 'under' };
}

/** Assemble the reproduction context from the current pivot state + response. Pure; no side effects. */
export function buildDetectionContext(
  data: HuntCrosstabResponse | null,
  config: HuntPivotConfig,
  query: string,
  pivotFilters: string[],
  rowValue: string,
  colValue: string,
  value: number,
): PivotDetectionContext | null {
  if (!config.rowField || !config.colField) return null;
  const cell = data?.cells.find((c) => c.row === rowValue && c.col === colValue);
  return {
    searchId: data?.searchId ?? null,
    computedAt: data?.computedAt ?? null,
    query,
    rowField: config.rowField,
    colField: config.colField,
    measure: { function: config.valueFn, distinctField: config.distinctField ?? null },
    pivotFilters: [...pivotFilters],
    selectedCell: { row: rowValue, col: colValue, value },
    significant: cell?.significance,
  };
}
