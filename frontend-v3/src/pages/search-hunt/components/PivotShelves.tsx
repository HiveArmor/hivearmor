import { useMemo, useState } from 'react';

import { AlertTriangle, ArrowLeftRight, Plus, X } from 'lucide-react';

import { isDateField, isTermAxisEligible } from '../lib/pivotAxisEligibility';
import type { HuntFieldDefinition } from '../searchHunt.types';

export interface PivotShelvesProps {
  fields: HuntFieldDefinition[];
  rowField: string | null;
  colField: string | null;
  valueFn: 'count' | 'distinct';
  distinctField: string | null;
  /** P1.1: per-axis date-histogram interval (null = TERM axis). */
  rowBucketInterval: string | null;
  colBucketInterval: string | null;
  /** P1.1: per-axis missing-value mode. */
  rowMissing: 'omit' | 'include';
  colMissing: 'omit' | 'include';
  /** P1.1 field intelligence: per-field coverage %/cardinality for the active search snapshot (null when no search yet). */
  statByField?: Map<string, { coverage: number | null; cardinality: number }>;
  /** The pivot's top-N bucket cap — a field with more distinct values than this truncates hard. */
  axisTopN?: number;
  onSetRow: (field: string | null) => void;
  onSetCol: (field: string | null) => void;
  onSetValueFn: (fn: 'count' | 'distinct') => void;
  onSetDistinctField: (field: string) => void;
  onSetRowBucketInterval: (interval: string | null) => void;
  onSetColBucketInterval: (interval: string | null) => void;
  onSetRowMissing: (mode: 'omit' | 'include') => void;
  onSetColMissing: (mode: 'omit' | 'include') => void;
  onSwap: () => void;
}

type ShelfTarget = 'row' | 'col' | 'distinct';

/** Allowed date-histogram intervals (mirrors the backend allow-list; server re-validates). */
const BUCKET_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '3h', '12h', '1d', '7d'];

/**
 * Pivot builder shelves (PR-B P1): Rows / Columns / Value drop zones.
 *
 * <p>Field assignment by drag-drop OR a keyboard-accessible "+ Add" menu per shelf (WCAG 2.2 AA —
 * drag alone is not keyboard-operable). Swap flips Rows/Columns. Value = Count or Distinct (+ a
 * distinct-of field picker). Non-axis-eligible fields (date, non-aggregatable text) are excluded
 * from the menus, mirroring the backend field capability.
 */
export function PivotShelves(props: PivotShelvesProps): JSX.Element {
  const {
    fields, rowField, colField, valueFn, distinctField,
    rowBucketInterval, colBucketInterval, rowMissing, colMissing,
    statByField, axisTopN = 50,
    onSetRow, onSetCol, onSetValueFn, onSetDistinctField,
    onSetRowBucketInterval, onSetColBucketInterval, onSetRowMissing, onSetColMissing, onSwap,
  } = props;
  const [openMenu, setOpenMenu] = useState<ShelfTarget | null>(null);

  // Axis menus offer term-eligible fields AND date fields (a date needs an interval, prompted below).
  const axisFields = useMemo(() => fields.filter((f) => isTermAxisEligible(f) || isDateField(f)), [fields]);
  // Distinct-of never accepts a date field.
  const distinctFields = useMemo(() => fields.filter(isTermAxisEligible), [fields]);
  const dateFieldNames = useMemo(() => new Set(fields.filter(isDateField).map((f) => f.name)), [fields]);

  const assign = (target: ShelfTarget, field: string) => {
    if (target === 'row') onSetRow(field);
    else if (target === 'col') onSetCol(field);
    else onSetDistinctField(field);
    setOpenMenu(null);
  };

  const onDrop = (target: ShelfTarget) => (e: React.DragEvent) => {
    e.preventDefault();
    const field = e.dataTransfer.getData('text/hunt-field') || e.dataTransfer.getData('text/plain');
    const pool = target === 'distinct' ? distinctFields : axisFields;
    if (field && pool.some((f) => f.name === field)) assign(target, field);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  const renderMenu = (target: ShelfTarget) => {
    const pool = target === 'distinct' ? distinctFields : axisFields;
    return (
      <ul className="pivot-shelf__menu" role="menu" aria-label="Choose a field">
        {pool.map((f) => (
          <li key={f.name}>
            <button type="button" role="menuitem" onClick={() => assign(target, f.name)}>
              <strong>{f.name}</strong><small>{f.type}{isDateField(f) ? ' · needs interval' : ''}</small>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  /** The interval picker shown when a date field occupies an axis. */
  const intervalPicker = (value: string, interval: string | null, onSet: (i: string | null) => void) =>
    dateFieldNames.has(value) ? (
      <label className="pivot-shelf__interval">
        <span>every</span>
        <select
          value={interval ?? ''}
          onChange={(e) => onSet(e.target.value || null)}
          aria-label={`Time interval for ${value}`}
        >
          <option value="" disabled>interval…</option>
          {BUCKET_INTERVALS.map((iv) => <option key={iv} value={iv}>{iv}</option>)}
        </select>
      </label>
    ) : null;

  /**
   * Field intelligence hint for an occupied axis: coverage % + cardinality, plus a low-coverage or
   * high-cardinality marker so the analyst can predict a sparse or heavily-truncated pivot before running
   * it. Text + icon (never colour alone) for a11y. Nothing rendered until a search snapshot exists.
   */
  const LOW_COVERAGE = 50; // below this %, the pivot will look sparse/misleading for this axis
  const fieldStatHint = (value: string) => {
    const stat = statByField?.get(value);
    if (!stat) return null;
    const lowCoverage = stat.coverage != null && stat.coverage < LOW_COVERAGE;
    const highCardinality = stat.cardinality > axisTopN;
    return (
      <span className="pivot-shelf__stat" aria-label={`${value} field intelligence`}>
        {stat.cardinality > 0 && <span className="pivot-shelf__stat-cardinality">~{stat.cardinality.toLocaleString()} values</span>}
        {stat.coverage != null && (
          <span className={`pivot-shelf__stat-coverage${lowCoverage ? ' pivot-shelf__stat-coverage--low' : ''}`}>
            {lowCoverage && <AlertTriangle size={10} aria-hidden="true" />}
            {stat.coverage}% coverage{lowCoverage ? ' (sparse)' : ''}
          </span>
        )}
        {highCardinality && (
          <span className="pivot-shelf__stat-warn" title={`More than ${axisTopN} distinct values — the pivot shows only the top ${axisTopN}`}>
            <AlertTriangle size={10} aria-hidden="true" /> top {axisTopN} only
          </span>
        )}
      </span>
    );
  };

  const shelf = (
    target: ShelfTarget, label: string, value: string | null,
    onClear?: () => void,
    interval?: string | null, onSetInterval?: (i: string | null) => void,
    missing?: 'omit' | 'include', onSetMissing?: (m: 'omit' | 'include') => void,
  ) => (
    <div className="pivot-shelf" onDrop={onDrop(target)} onDragOver={allowDrop}>
      <span className="pivot-shelf__label">{label}</span>
      {value ? (
        <span className="pivot-shelf__chip">
          <code>{value}</code>
          {onClear && (
            <button type="button" className="pivot-shelf__remove" aria-label={`Remove ${value}`} onClick={onClear}>
              <X size={11} aria-hidden="true" />
            </button>
          )}
          {fieldStatHint(value)}
        </span>
      ) : (
        <span className="pivot-shelf__placeholder">Drop a field</span>
      )}
      {value && onSetInterval && intervalPicker(value, interval ?? null, onSetInterval)}
      {value && onSetMissing && !dateFieldNames.has(value) && (
        <label className="pivot-shelf__missing">
          <input
            type="checkbox"
            checked={missing === 'include'}
            onChange={(e) => onSetMissing(e.target.checked ? 'include' : 'omit')}
            aria-label={`Include a (missing) bucket for ${value}`}
          />
          <span>(missing)</span>
        </label>
      )}
      <div className="pivot-shelf__add-wrap">
        <button
          type="button"
          className="pivot-shelf__add"
          aria-haspopup="menu"
          aria-expanded={openMenu === target}
          aria-label={`Add a field to ${label}`}
          onClick={() => setOpenMenu(openMenu === target ? null : target)}
          title={`Add a field to ${label}`}
        >
          <Plus size={12} aria-hidden="true" /> Add
        </button>
        {openMenu === target && renderMenu(target)}
      </div>
    </div>
  );

  return (
    <div className="pivot-shelves" role="group" aria-label="Pivot builder">
      {shelf('row', 'Rows', rowField, rowField ? () => onSetRow(null) : undefined, rowBucketInterval, onSetRowBucketInterval, rowMissing, onSetRowMissing)}
      <button type="button" className="pivot-shelves__swap" onClick={onSwap} title="Swap rows and columns" aria-label="Swap rows and columns">
        <ArrowLeftRight size={13} aria-hidden="true" />
      </button>
      {shelf('col', 'Columns', colField, colField ? () => onSetCol(null) : undefined, colBucketInterval, onSetColBucketInterval, colMissing, onSetColMissing)}
      <div className="pivot-shelf pivot-shelf--value">
        <span className="pivot-shelf__label">Value</span>
        <div className="pivot-value-toggle" role="group" aria-label="Measure">
          <button type="button" aria-pressed={valueFn === 'count'} onClick={() => onSetValueFn('count')}>Count</button>
          <button type="button" aria-pressed={valueFn === 'distinct'} onClick={() => onSetValueFn('distinct')}>Distinct</button>
        </div>
        {valueFn === 'distinct' && (
          <label className="pivot-value-distinct">
            <span>of</span>
            <select
              value={distinctField ?? ''}
              onChange={(e) => onSetDistinctField(e.target.value)}
              aria-label="Distinct count field"
            >
              <option value="" disabled>choose field…</option>
              {distinctFields.map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
