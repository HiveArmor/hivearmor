/**
 * PT-3 — hostAssociationRows pure helpers: form<->PT-0 doc, any-invariant validation, reorder.
 */

import { describe, expect, it } from 'vitest';

import {
  defaultRows,
  docToForm,
  formToDoc,
  reorder,
  validateRows,
} from './hostAssociationRows';

import type { AssociationRowForm, AssociationTableDoc } from '@/types/hostTemplateAssociations';

describe('hostAssociationRows', () => {
  it('defaultRows is a single any catch-all (valid)', () => {
    const rows = defaultRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].matchKind).toBe('any');
    expect(validateRows(rows.map((r) => ({ ...r, templates: ['t'] })))).toEqual([]);
  });

  it('formToDoc re-derives ranks from order and forces any to the end', () => {
    const form: AssociationRowForm[] = [
      { rank: 0, name: 'Other', matchKind: 'any', matchValue: '', templates: ['basic'] },
      { rank: 0, name: 'Crit', matchKind: 'group', matchValue: 'Critical', templates: ['full', 'scan'] },
    ];
    const doc = JSON.parse(formToDoc(form, 'ORG', 'acme')) as AssociationTableDoc;
    expect(doc.rows.map((r) => r.rank)).toEqual([1, 2]);
    // any is last (highest rank), the group row first
    expect(doc.rows[0].match.group).toBe('Critical');
    expect(doc.rows[1].match.any).toBe(true);
    expect(doc.orgId).toBe('acme');
    expect(doc.rows[0].templates).toEqual(['full', 'scan']);
  });

  it('formToDoc omits orgId for GLOBAL scope', () => {
    const doc = JSON.parse(
      formToDoc([{ rank: 1, name: 'Any', matchKind: 'any', matchValue: '', templates: ['t'] }], 'GLOBAL', 'acme'),
    ) as AssociationTableDoc;
    expect(doc.scope).toBe('GLOBAL');
    expect(doc.orgId).toBeUndefined();
  });

  it('docToForm round-trips and sorts by rank', () => {
    const json = JSON.stringify({
      scope: 'ORG',
      rows: [
        { rank: 2, name: 'B', match: { host: '42' }, templates: ['x'] },
        { rank: 1, name: 'A', match: { group: 'G' }, templates: ['y'] },
      ],
    });
    const form = docToForm(json);
    expect(form.map((r) => r.name)).toEqual(['A', 'B']);
    expect(form[1].matchKind).toBe('host');
    expect(form[1].matchValue).toBe('42');
  });

  it('validateRows rejects a table with no any catch-all', () => {
    const errs = validateRows([
      { rank: 1, name: 'C', matchKind: 'group', matchValue: 'G', templates: ['t'] },
    ]);
    expect(errs.join(' ')).toMatch(/Any host/i);
  });

  it('validateRows rejects more than one any row', () => {
    const errs = validateRows([
      { rank: 1, name: 'a1', matchKind: 'any', matchValue: '', templates: ['t'] },
      { rank: 2, name: 'a2', matchKind: 'any', matchValue: '', templates: ['t'] },
    ]);
    expect(errs.join(' ')).toMatch(/Only one/i);
  });

  it('validateRows flags a non-any row with no match value and no templates', () => {
    const errs = validateRows([
      { rank: 1, name: 'C', matchKind: 'group', matchValue: '', templates: [] },
      { rank: 2, name: 'Any', matchKind: 'any', matchValue: '', templates: ['t'] },
    ]);
    expect(errs.some((e) => /group value/i.test(e))).toBe(true);
    expect(errs.some((e) => /at least one template/i.test(e))).toBe(true);
  });

  it('reorder moves a row up/down and is a no-op at the edges', () => {
    const rows: AssociationRowForm[] = [
      { rank: 1, name: 'A', matchKind: 'group', matchValue: 'G1', templates: ['t'] },
      { rank: 2, name: 'B', matchKind: 'group', matchValue: 'G2', templates: ['t'] },
    ];
    expect(reorder(rows, 1, 'up').map((r) => r.name)).toEqual(['B', 'A']);
    expect(reorder(rows, 0, 'up').map((r) => r.name)).toEqual(['A', 'B']); // no-op at top
    expect(reorder(rows, 1, 'down').map((r) => r.name)).toEqual(['A', 'B']); // no-op at bottom
  });
});
