import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Copy, FileText, Filter, Info, Layers, MinusCircle, PlusCircle, Search, Share2, Shield, ShieldAlert, User as UserIcon, Activity } from 'lucide-react';

import { resolveEntityType, timelineAvailable } from '../lib/entityType';

/**
 * Cell actions. P1: Drill/Keep/Exclude modify the hunt (Copy is clipboard). P1.1 adds the
 * investigation group — View entity / Open timeline (row-entity), Add evidence / Create incident
 * (drill-then-promote) — and Filter this Pivot (a pivot-local scratch filter that narrows only the
 * crosstab, never the hunt query). Investigation items are offered only when the field supports them.
 */
export type PivotCellAction =
  | 'drill'
  | 'keep'
  | 'exclude'
  | 'copy'
  | 'filter_pivot'
  | 'pivot_further'
  | 'explain_cell'
  | 'view_entity'
  | 'open_timeline'
  | 'add_evidence'
  | 'create_incident'
  | 'create_detection'
  | 'view_entity_graph';

export interface PivotCellMenuProps {
  /** Selected cell coordinates for the header line. */
  rowField: string;
  colField: string;
  rowValue: string;
  colValue: string;
  value: number;
  valueLabel: string;
  /** Anchor position (viewport coords) for the popover. */
  x: number;
  y: number;
  onAction: (action: PivotCellAction) => void;
  onClose: () => void;
}

/**
 * Cell-action popover for the crosstab matrix.
 *
 * <p>P1 actions: Drill to Events (temporary drill filter + switch to Table + Return-to-Pivot),
 * Keep in Hunt / Exclude from Hunt (modify the committed hunt query — Exclude is NOT(A AND B), the
 * intersection only), and Copy Filter (clipboard). P1.1 adds an investigation group, gated on the
 * row field's entity type: View entity (entity-typed row), Open timeline (user row), and
 * Add evidence / Create incident (drill the cell's events, then open the existing promotion UI).
 * Keyboard: Esc closes; focus is trapped to the menu.
 */
export function PivotCellMenu(props: PivotCellMenuProps): JSX.Element {
  const { rowField, colField, rowValue, colValue, value, valueLabel, x, y, onAction, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  // Investigation-group availability, derived from the ROW field (the primary entity axis).
  const rowEntityType = resolveEntityType(rowField);
  const canViewEntity = rowEntityType !== null;
  const canOpenTimeline = timelineAvailable(rowField);

  // Clamp the popover into the viewport: a cell near the bottom/right edge would otherwise render the
  // (tall) menu off-screen — clipped by the page footer. Measure after mount and flip/nudge as needed.
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: y, left: x });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    let top = y;
    let left = x;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
    setPos({ top, left });
  }, [x, y]);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>('button');
    first?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onClickAway, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClickAway, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="pivot-cell-menu"
      role="menu"
      aria-label="Cell actions"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="pivot-cell-menu__header">
        <code>{rowField}: {rowValue}</code>
        <code>{colField}: {colValue}</code>
        <span className="pivot-cell-menu__value">{valueLabel}: {value.toLocaleString()}</span>
      </div>
      <button type="button" role="menuitem" onClick={() => onAction('drill')}>
        <Search size={13} aria-hidden="true" /> Drill to events
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('keep')}>
        <PlusCircle size={13} aria-hidden="true" /> Keep in Hunt
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('exclude')}>
        <MinusCircle size={13} aria-hidden="true" /> Exclude from Hunt
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('filter_pivot')}>
        <Filter size={13} aria-hidden="true" /> Filter this Pivot
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('pivot_further')}>
        <Layers size={13} aria-hidden="true" /> Pivot further into this cell
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('explain_cell')}>
        <Info size={13} aria-hidden="true" /> Explain this cell
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('copy')}>
        <Copy size={13} aria-hidden="true" /> Copy filter
      </button>

      <div className="pivot-cell-menu__divider" role="separator" />

      {canViewEntity && (
        <button type="button" role="menuitem" onClick={() => onAction('view_entity')}>
          <UserIcon size={13} aria-hidden="true" /> View entity
        </button>
      )}
      {canViewEntity && (
        <button type="button" role="menuitem" onClick={() => onAction('view_entity_graph')}>
          <Share2 size={13} aria-hidden="true" /> View relationship graph
        </button>
      )}
      {canOpenTimeline && (
        <button type="button" role="menuitem" onClick={() => onAction('open_timeline')}>
          <Activity size={13} aria-hidden="true" /> Open timeline
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => onAction('add_evidence')}>
        <FileText size={13} aria-hidden="true" /> Add evidence…
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('create_incident')}>
        <Shield size={13} aria-hidden="true" /> Create incident…
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('create_detection')}>
        <ShieldAlert size={13} aria-hidden="true" /> Create detection candidate…
      </button>
    </div>
  );
}
