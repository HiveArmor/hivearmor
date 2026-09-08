import type { HuntCrosstabResponse } from './searchHunt.types';

/**
 * Build a CSV string from a crosstab response — client-side, formula-injection safe.
 *
 * <p>PR-B P1. Any cell starting with {@code = + - @} is prefixed with a single quote so spreadsheet
 * apps do not evaluate it as a formula. Values containing {@code " , \n \r} are quoted with inner
 * quotes doubled. This is a security product — the export must be safe to open.
 *
 * <p>Layout: corner label {@code rowField \ colField}, then the column keys, then {@code Total}; one
 * row per row key with its cells + row total; a final {@code Total} row with column totals + grand.
 * The matrix is honest: totals are NOT the sum of the visible cells (see totalSemantics.additive).
 */
export function buildCrosstabCsv(
  data: HuntCrosstabResponse,
  rowField: string,
  colField: string,
  orderedRowKeys?: string[],
  orderedColKeys?: string[],
): string {
  const rowKeys = orderedRowKeys ?? data.rowKeys;
  const colKeys = orderedColKeys ?? data.colKeys;

  // Sparse cell lookup.
  const cell = new Map<string, number>();
  for (const c of data.cells) cell.set(`${c.row}\u0000${c.col}`, c.value);

  const rowTotal = new Map<string, number>();
  data.rowKeys.forEach((k, i) => rowTotal.set(k, data.rowTotals[i] ?? 0));
  const colTotal = new Map<string, number>();
  data.colKeys.forEach((k, i) => colTotal.set(k, data.colTotals[i] ?? 0));

  const lines: string[] = [];
  lines.push([`${rowField} \\ ${colField}`, ...colKeys, 'Total'].map(csvField).join(','));
  for (const r of rowKeys) {
    const cells = colKeys.map((c) => String(cell.get(`${r}\u0000${c}`) ?? 0));
    lines.push([r, ...cells, String(rowTotal.get(r) ?? 0)].map(csvField).join(','));
  }
  const colTotalsRow = colKeys.map((c) => String(colTotal.get(c) ?? 0));
  lines.push(['Total', ...colTotalsRow, String(data.grandTotal)].map(csvField).join(','));
  return lines.join('\r\n');
}

/** Escape one CSV field, guarding against CSV formula injection. */
export function csvField(raw: string): string {
  let value = raw ?? '';
  // Formula-injection guard: neutralize a leading =, +, -, @ (and leading tab/CR which some apps strip).
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Default download filename for a crosstab export. */
export function crosstabCsvFilename(rowField: string, colField: string, valueFn: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `hunt-pivot_${safe(rowField)}_x_${safe(colField)}_${safe(valueFn)}_${stamp}.csv`;
}
