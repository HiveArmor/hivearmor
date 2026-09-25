/**
 * PT-3 — pure helpers to convert association rows between the editor form and the PT-0
 * `host-template-association` document, plus client-side validation mirroring the backend
 * invariant (exactly one `any` catch-all at the highest rank). Pure + unit-tested; the page
 * stays thin. The backend re-validates authoritatively — this is UX, not the security boundary.
 */

import type {
  AssociationRow,
  AssociationRowForm,
  AssociationTableDoc,
  MatchKind,
} from '@/types/hostTemplateAssociations';

/** A safe starting table: one `any` catch-all so a fresh table is already valid. */
export function defaultRows(): AssociationRowForm[] {
  return [
    { rank: 1, name: 'All hosts (default)', matchKind: 'any', matchValue: '', templates: [] },
  ];
}

function matchToForm(row: AssociationRow): Pick<AssociationRowForm, 'matchKind' | 'matchValue'> {
  if (row.match.any) return { matchKind: 'any', matchValue: '' };
  if (row.match.group != null) return { matchKind: 'group', matchValue: row.match.group };
  if (row.match.host != null) return { matchKind: 'host', matchValue: row.match.host };
  if (row.match.tag != null) return { matchKind: 'tag', matchValue: row.match.tag };
  return { matchKind: 'any', matchValue: '' };
}

/** Parse a persisted `rowsJson` into editor rows (sorted by rank for display). */
export function docToForm(rowsJson: string | null | undefined): AssociationRowForm[] {
  if (!rowsJson) return defaultRows();
  let doc: AssociationTableDoc;
  try {
    doc = JSON.parse(rowsJson) as AssociationTableDoc;
  } catch {
    return defaultRows();
  }
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (rows.length === 0) return defaultRows();
  return [...rows]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((r) => ({
      rank: r.rank,
      name: r.name,
      templates: Array.isArray(r.templates) ? [...r.templates] : [],
      ...matchToForm(r),
    }));
}

/**
 * Build the PT-0 `rowsJson` document from editor rows. Ranks are re-derived from the CURRENT
 * array order (1..N) so up/down reorder is the authoritative rank source — the `any` row is
 * forced to the end so it is always the highest rank, matching the backend invariant.
 */
export function formToDoc(
  formRows: AssociationRowForm[],
  scope: 'GLOBAL' | 'ORG',
  orgId?: string | null,
): string {
  // stable: keep given order, but move the (single) any row to the end
  const nonAny = formRows.filter((r) => r.matchKind !== 'any');
  const any = formRows.filter((r) => r.matchKind === 'any');
  const ordered = [...nonAny, ...any];
  const rows: AssociationRow[] = ordered.map((r, i) => ({
    rank: i + 1,
    name: r.name.trim(),
    match: buildMatch(r.matchKind, r.matchValue),
    templates: r.templates.map((t) => t.trim()).filter(Boolean),
  }));
  const doc: AssociationTableDoc = { scope, rows };
  if (scope === 'ORG' && orgId) doc.orgId = orgId;
  return JSON.stringify(doc);
}

function buildMatch(kind: MatchKind, value: string): AssociationRow['match'] {
  switch (kind) {
    case 'any':
      return { any: true };
    case 'group':
      return { group: value.trim() };
    case 'host':
      return { host: value.trim() };
    case 'tag':
      return { tag: value.trim() };
  }
}

/** Client-side validation mirroring the backend rules. Returns human messages (empty = valid). */
export function validateRows(formRows: AssociationRowForm[]): string[] {
  const errs: string[] = [];
  if (formRows.length === 0) {
    errs.push('Add at least one row.');
    return errs;
  }
  const anyRows = formRows.filter((r) => r.matchKind === 'any');
  if (anyRows.length === 0) {
    errs.push('Add an "Any host" catch-all row so every host resolves.');
  }
  if (anyRows.length > 1) {
    errs.push('Only one "Any host" catch-all row is allowed.');
  }
  formRows.forEach((r, i) => {
    const label = r.name.trim() || `Row ${i + 1}`;
    if (!r.name.trim()) errs.push(`Row ${i + 1}: name is required.`);
    if (r.matchKind !== 'any' && !r.matchValue.trim()) {
      errs.push(`${label}: enter a ${r.matchKind} value or use "Any host".`);
    }
    if (r.templates.filter((t) => t.trim()).length === 0) {
      errs.push(`${label}: pick at least one template.`);
    }
  });
  return errs;
}

/** Move a row up/down within the editor array (pure; returns a new array). */
export function reorder(rows: AssociationRowForm[], index: number, dir: 'up' | 'down'): AssociationRowForm[] {
  const target = dir === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return next;
}
