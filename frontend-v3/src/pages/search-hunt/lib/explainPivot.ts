/**
 * Explain Pivot / Explain Cell (P3 PR 2) — DETERMINISTIC, template-first plain-language explanations.
 *
 * <p>No AI provider needed: these compose an honest sentence directly from the crosstab response the
 * engine already returned. (An optional LLM enrichment via /ha-hunts/ai/explain is a later follow-up.)
 * Everything stated here is a fact from the response — the scope, the measure, the non-additive caveat,
 * truncation, bucketing, missing/multi-valued disclosure, and the comparison window when present.
 */

import type { HuntCrosstabCell, HuntCrosstabResponse } from '../searchHunt.types';

/** A short list of plain-language sentences explaining the current crosstab. Never invents a number. */
export function explainPivot(data: HuntCrosstabResponse, rowField: string, colField: string): string[] {
  const out: string[] = [];
  const measure = data.measure.function === 'distinct'
    ? `the number of distinct ${data.measure.field ?? 'values'}`
    : 'a count of events';

  out.push(
    `This pivot breaks ${data.pivotEligibleMatched.toLocaleString()} events down by ${rowField} (rows) `
    + `and ${colField} (columns), showing ${measure} in each cell.`,
  );

  if (data.pivotEligibleMatched !== data.totalMatched) {
    out.push(
      `Of ${data.totalMatched.toLocaleString()} matched events, ${data.pivotEligibleMatched.toLocaleString()} `
      + `have both fields present and take part in the pivot — the rest are set aside.`,
    );
  }

  // The non-additive caveat is always true for this engine.
  out.push(
    `Row, column and grand totals are counted at their own scope, not by adding up the cells, so the `
    + `cells may not sum to a total (this is expected, not an error).`,
  );

  if (data.rowMultiValued || data.colMultiValued) {
    const mv = [data.rowMultiValued ? rowField : null, data.colMultiValued ? colField : null].filter(Boolean).join(' and ');
    out.push(`${mv} can hold several values per event, so one event may appear in more than one ${data.rowMultiValued && data.colMultiValued ? 'row and column' : 'bucket'}.`);
  }

  if (data.rowBucketed || data.colBucketed) {
    const parts: string[] = [];
    if (data.rowBucketed && data.rowBucketInterval) parts.push(`rows are grouped into ${data.rowBucketInterval} time buckets`);
    if (data.colBucketed && data.colBucketInterval) parts.push(`columns are grouped into ${data.colBucketInterval} time buckets`);
    if (parts.length) out.push(parts.join('; ') + '.');
  }

  if (data.rowHasMissingBucket || data.colHasMissingBucket) {
    out.push(`A "(no value)" bucket is included for events missing the field on that axis.`);
  }

  if (data.rowTruncated || data.colTruncated) {
    const t: string[] = [];
    if (data.rowTruncated) t.push(`rows show the top ${data.rowKeys.length} of ~${data.rowCardinalityEstimate.toLocaleString()} ${rowField} values`);
    if (data.colTruncated) t.push(`columns show the top ${data.colKeys.length} of ~${data.colCardinalityEstimate.toLocaleString()} ${colField} values`);
    out.push(`Only the most frequent members are shown — ${t.join('; ')} — so rare values are not listed.`);
  }

  if (data.comparison) {
    out.push(`Each cell is compared against the previous period; the small figure beneath a value is the change.`);
  }

  return out;
}

/** A one-sentence explanation of a single cell's meaning and the filter behind it. */
export function explainCell(
  data: HuntCrosstabResponse,
  rowField: string, colField: string,
  rowValue: string, colValue: string,
  value: number,
  cell?: HuntCrosstabCell,
): string {
  const measure = data.measure.function === 'distinct'
    ? `distinct ${data.measure.field ?? 'values'}`
    : 'events';
  let s = `This cell counts ${value.toLocaleString()} ${measure} where ${rowField} is "${rowValue}" and `
    + `${colField} is "${colValue}".`;
  if (cell?.comparisonValue != null && cell.delta != null) {
    const dir = cell.delta > 0 ? 'up' : cell.delta < 0 ? 'down' : 'unchanged';
    const pct = cell.deltaPercent != null ? ` (${cell.deltaPercent > 0 ? '+' : ''}${Math.round(cell.deltaPercent)}%)` : '';
    s += ` That is ${dir}${pct} from ${cell.comparisonValue.toLocaleString()} in the previous period.`;
  }
  return s;
}
