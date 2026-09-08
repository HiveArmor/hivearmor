import { useEffect, useRef } from 'react';

import { Copy, MinusCircle, PlusCircle, Search } from 'lucide-react';

/** The four P1 cell actions. Keep/Exclude modify the hunt query; Drill switches to Table; Copy is clipboard. */
export type PivotCellAction = 'drill' | 'keep' | 'exclude' | 'copy';

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
 * Cell-action popover for the crosstab matrix (PR-B P1).
 *
 * <p>Four actions: Drill to Events (temporary drill filter + switch to Table + Return-to-Pivot),
 * Keep in Hunt / Exclude from Hunt (modify the committed hunt query — Exclude is NOT(A AND B), the
 * intersection only), and Copy Filter (clipboard). Keyboard: Esc closes; focus is trapped to the menu.
 */
export function PivotCellMenu(props: PivotCellMenuProps): JSX.Element {
  const { rowField, colField, rowValue, colValue, value, valueLabel, x, y, onAction, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

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
      style={{ top: y, left: x }}
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
      <button type="button" role="menuitem" onClick={() => onAction('copy')}>
        <Copy size={13} aria-hidden="true" /> Copy filter
      </button>
    </div>
  );
}
