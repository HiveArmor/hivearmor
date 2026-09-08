import { useCallback, useMemo, useState } from 'react';

import { PivotCellMenu, type PivotCellAction } from './PivotCellMenu';
import type { HuntCrosstabResponse } from '../searchHunt.types';

export interface PivotMatrixProps {
  data: HuntCrosstabResponse;
  rowField: string;
  colField: string;
  /** Heat tint on/off (a secondary hint paired with the number, never the sole signal). */
  heat: boolean;
  /** Cell action chosen from the popover. rowValue/colValue are the member keys. */
  onCellAction: (action: PivotCellAction, rowValue: string, colValue: string, value: number) => void;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * The crosstab matrix — a semantic HTML table (NOT AG Grid: totals-bearing + fully keyboard-navigable
 * is simpler and more accessible as a table, and AG Grid pivot is Enterprise-only).
 *
 * <p>PR-B P1: sticky row/column headers, right-aligned tabular-nums, row/col/grand totals (own-scope,
 * never summed from cells), client-side sort, heat tint (neutral/teal ramp), selected + focused cell,
 * arrow-key navigation, aria-sort, scope-correct headers. Value colours are never severities.
 */
export function PivotMatrix({ data, rowField, colField, heat, onCellAction }: PivotMatrixProps): JSX.Element {
  const [sort, setSort] = useState<SortState>(null);
  const [menu, setMenu] = useState<{ row: string; col: string; value: number; x: number; y: number } | null>(null);

  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data.cells) m.set(`${c.row}\u0000${c.col}`, c.value);
    return m;
  }, [data.cells]);

  const rowTotal = useMemo(() => {
    const m = new Map<string, number>();
    data.rowKeys.forEach((k, i) => m.set(k, data.rowTotals[i] ?? 0));
    return m;
  }, [data.rowKeys, data.rowTotals]);

  const colTotalByKey = useMemo(() => {
    const m = new Map<string, number>();
    data.colKeys.forEach((k, i) => m.set(k, data.colTotals[i] ?? 0));
    return m;
  }, [data.colKeys, data.colTotals]);

  // Client-side sort of rows: by a column's cell value, or by row total, or default (server order).
  const orderedRowKeys = useMemo(() => {
    if (!sort) return data.rowKeys;
    const valueFor = (r: string): number =>
      sort.key === '__total__' ? (rowTotal.get(r) ?? 0) : (cellMap.get(`${r}\u0000${sort.key}`) ?? 0);
    const keys = [...data.rowKeys];
    keys.sort((a, b) => (sort.dir === 'desc' ? valueFor(b) - valueFor(a) : valueFor(a) - valueFor(b)));
    return keys;
  }, [sort, data.rowKeys, rowTotal, cellMap]);

  const maxCell = useMemo(() => data.cells.reduce((mx, c) => Math.max(mx, c.value), 0), [data.cells]);

  const onHeaderSort = useCallback((key: string) => {
    setSort((cur) => {
      if (cur && cur.key === key) return { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' };
      return { key, dir: 'desc' };
    });
  }, []);

  const ariaSortFor = (key: string): 'ascending' | 'descending' | 'none' => {
    if (!sort || sort.key !== key) return 'none';
    return sort.dir === 'desc' ? 'descending' : 'ascending';
  };

  const heatStyle = (value: number): React.CSSProperties | undefined => {
    if (!heat || maxCell <= 0 || value <= 0) return undefined;
    const pct = Math.round((value / maxCell) * 22); // capped subtle teal tint
    return { background: `color-mix(in srgb, var(--ha-action-primary) ${pct}%, transparent)` };
  };

  // Bucketed axes carry ISO bucket-start keys; render them as readable time labels (the underlying
  // key stays the ISO string for cell actions + sort). A parse failure falls back to the raw key.
  const fmtTime = (iso: string, interval?: string | null): string => {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return iso;
    const d = new Date(ms);
    const dayGranularity = interval != null && /d$/.test(interval);
    return dayGranularity
      ? d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
      : d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const fmtRow = (k: string): string => (k === data.missingKey ? '(no value)' : data.rowBucketed ? fmtTime(k, data.rowBucketInterval) : k);
  const fmtCol = (k: string): string => (k === data.missingKey ? '(no value)' : data.colBucketed ? fmtTime(k, data.colBucketInterval) : k);

  const openMenu = (row: string, col: string, value: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setMenu({ row, col, value, x: Math.min(rect.left, window.innerWidth - 220), y: rect.bottom + 2 });
  };

  const onCellKeyDown = (e: React.KeyboardEvent<HTMLTableCellElement>, ri: number, ci: number) => {
    const rows = orderedRowKeys.length;
    const cols = data.colKeys.length;
    let nr = ri;
    let nc = ci;
    if (e.key === 'ArrowRight') nc = Math.min(cols - 1, ci + 1);
    else if (e.key === 'ArrowLeft') nc = Math.max(0, ci - 1);
    else if (e.key === 'ArrowDown') nr = Math.min(rows - 1, ri + 1);
    else if (e.key === 'ArrowUp') nr = Math.max(0, ri - 1);
    else if (e.key === 'Enter') {
      const value = cellMap.get(`${orderedRowKeys[ri]}\u0000${data.colKeys[ci]}`) ?? 0;
      openMenu(orderedRowKeys[ri], data.colKeys[ci], value, e.currentTarget);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    const next = document.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`);
    next?.focus();
  };

  const valueLabel = data.measure.function === 'distinct'
    ? `distinct ${data.measure.field ?? ''}`.trim()
    : 'count';

  // Multi-valued disclosure: name the array axis/axes so the analyst understands why cells can
  // exceed a total (an event with several values lands in several buckets). Display-only.
  const multiValuedFields = [
    data.rowMultiValued ? rowField : null,
    data.colMultiValued ? colField : null,
  ].filter((f): f is string => f !== null);

  return (
    <div className="pivot-matrix-scroll">
      {multiValuedFields.length > 0 && (
        <p className="pivot-matrix__multivalued" role="note">
          {multiValuedFields.join(' and ')} {multiValuedFields.length > 1 ? 'are' : 'is'} multi-valued —
          an event can carry several values, so a row or column can list an event more than once and
          cells may exceed the total.
        </p>
      )}
      <table className="pivot-matrix" aria-label={`Crosstab of ${rowField} by ${colField}, ${valueLabel}`}>
        <caption className="pivot-matrix__caption">
          {`Crosstab of ${rowField} by ${colField} — ${valueLabel} over ${data.pivotEligibleMatched.toLocaleString()} pivot-eligible events`}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pivot-matrix__corner">{rowField} \ {colField}</th>
            {data.colKeys.map((c) => (
              <th
                key={c}
                scope="col"
                aria-sort={ariaSortFor(c)}
                className="pivot-matrix__colhead"
              >
                <button type="button" onClick={() => onHeaderSort(c)} title={`Sort rows by ${fmtCol(c)}`}>{fmtCol(c)}</button>
              </th>
            ))}
            <th scope="col" aria-sort={ariaSortFor('__total__')} className="pivot-matrix__colhead pivot-matrix__total-col">
              <button type="button" onClick={() => onHeaderSort('__total__')} title="Sort rows by total">Total</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedRowKeys.map((r, ri) => (
            <tr key={r}>
              <th scope="row" className="pivot-matrix__rowhead">{fmtRow(r)}</th>
              {data.colKeys.map((c, ci) => {
                const value = cellMap.get(`${r}\u0000${c}`) ?? 0;
                return (
                  <td
                    key={c}
                    data-cell={`${ri}-${ci}`}
                    tabIndex={ri === 0 && ci === 0 ? 0 : -1}
                    className="pivot-matrix__cell"
                    style={heatStyle(value)}
                    onClick={(e) => value > 0 && openMenu(r, c, value, e.currentTarget)}
                    onKeyDown={(e) => onCellKeyDown(e, ri, ci)}
                    aria-label={`${fmtRow(r)}, ${fmtCol(c)}: ${value}`}
                  >
                    {value > 0 ? value.toLocaleString() : ''}
                  </td>
                );
              })}
              <td className="pivot-matrix__cell pivot-matrix__total-col">{(rowTotal.get(r) ?? 0).toLocaleString()}</td>
            </tr>
          ))}
          <tr className="pivot-matrix__total-row">
            <th scope="row" className="pivot-matrix__rowhead">Total</th>
            {data.colKeys.map((c) => (
              <td key={c} className="pivot-matrix__cell">{(colTotalByKey.get(c) ?? 0).toLocaleString()}</td>
            ))}
            <td className="pivot-matrix__cell pivot-matrix__grand">{data.grandTotal.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      {menu && (
        <PivotCellMenu
          rowField={rowField}
          colField={colField}
          rowValue={menu.row}
          colValue={menu.col}
          value={menu.value}
          valueLabel={valueLabel}
          x={menu.x}
          y={menu.y}
          onAction={(action) => {
            onCellAction(action, menu.row, menu.col, menu.value);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
