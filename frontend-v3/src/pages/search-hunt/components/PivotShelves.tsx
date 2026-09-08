import { useMemo, useState } from 'react';

import { ArrowLeftRight, Plus, X } from 'lucide-react';

import type { HuntFieldDefinition } from '../searchHunt.types';

export interface PivotShelvesProps {
  fields: HuntFieldDefinition[];
  rowField: string | null;
  colField: string | null;
  valueFn: 'count' | 'distinct';
  distinctField: string | null;
  onSetRow: (field: string | null) => void;
  onSetCol: (field: string | null) => void;
  onSetValueFn: (fn: 'count' | 'distinct') => void;
  onSetDistinctField: (field: string) => void;
  onSwap: () => void;
}

type ShelfTarget = 'row' | 'col' | 'distinct';

/** Client mirror of the backend capability: date disabled, text-without-keyword disabled. */
function isAxisEligible(f: HuntFieldDefinition): boolean {
  if (f.type === 'date') return false;
  if (f.type === 'text' && !f.operators.includes(':')) return false;
  // text WITH ':' operator is keyword-backed and aggregatable in this schema.
  return true;
}

/**
 * Pivot builder shelves (PR-B P1): Rows / Columns / Value drop zones.
 *
 * <p>Field assignment by drag-drop OR a keyboard-accessible "+ Add" menu per shelf (WCAG 2.2 AA —
 * drag alone is not keyboard-operable). Swap flips Rows/Columns. Value = Count or Distinct (+ a
 * distinct-of field picker). Non-axis-eligible fields (date, non-aggregatable text) are excluded
 * from the menus, mirroring the backend field capability.
 */
export function PivotShelves(props: PivotShelvesProps): JSX.Element {
  const { fields, rowField, colField, valueFn, distinctField, onSetRow, onSetCol, onSetValueFn, onSetDistinctField, onSwap } = props;
  const [openMenu, setOpenMenu] = useState<ShelfTarget | null>(null);

  const axisFields = useMemo(() => fields.filter(isAxisEligible), [fields]);

  const assign = (target: ShelfTarget, field: string) => {
    if (target === 'row') onSetRow(field);
    else if (target === 'col') onSetCol(field);
    else onSetDistinctField(field);
    setOpenMenu(null);
  };

  const onDrop = (target: ShelfTarget) => (e: React.DragEvent) => {
    e.preventDefault();
    const field = e.dataTransfer.getData('text/hunt-field') || e.dataTransfer.getData('text/plain');
    if (field && axisFields.some((f) => f.name === field)) assign(target, field);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  const renderMenu = (target: ShelfTarget) => (
    <ul className="pivot-shelf__menu" role="menu" aria-label="Choose a field">
      {axisFields.map((f) => (
        <li key={f.name}>
          <button type="button" role="menuitem" onClick={() => assign(target, f.name)}>
            <strong>{f.name}</strong><small>{f.type}</small>
          </button>
        </li>
      ))}
    </ul>
  );

  const shelf = (target: ShelfTarget, label: string, value: string | null, onClear?: () => void) => (
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
        </span>
      ) : (
        <span className="pivot-shelf__placeholder">Drop a field</span>
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
      {shelf('row', 'Rows', rowField, rowField ? () => onSetRow(null) : undefined)}
      <button type="button" className="pivot-shelves__swap" onClick={onSwap} title="Swap rows and columns" aria-label="Swap rows and columns">
        <ArrowLeftRight size={13} aria-hidden="true" />
      </button>
      {shelf('col', 'Columns', colField, colField ? () => onSetCol(null) : undefined)}
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
              {axisFields.map((f) => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
