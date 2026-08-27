/**
 * IndexScopePicker — Splunk/Discover-style data-source scope control for Search & Hunt.
 * Replaces native <select> (which dumps every option into accessible name / chrome).
 */

import { useEffect, useId, useRef, useState } from 'react';

import { Check, ChevronDown, Database } from 'lucide-react';

export type HuntIndexScope = 'all' | 'log' | 'event' | 'alert';

export interface HuntIndexScopeOption {
  value: HuntIndexScope;
  label: string;
  shortLabel: string;
  detail: string;
}

export const HUNT_INDEX_SCOPE_OPTIONS: HuntIndexScopeOption[] = [
  {
    value: 'all',
    label: 'All sources',
    shortLabel: 'All sources',
    detail: 'Search logs and alerts in the authorized tenant scope',
  },
  {
    value: 'log',
    label: 'Raw logs',
    shortLabel: 'Raw logs',
    detail: 'Endpoint and collector log telemetry only',
  },
  {
    value: 'event',
    label: 'Endpoint events',
    shortLabel: 'Endpoint events',
    detail: 'Normalized endpoint activity (process, network, file)',
  },
  {
    value: 'alert',
    label: 'Alerts',
    shortLabel: 'Alerts',
    detail: 'Detection findings only — not raw telemetry',
  },
];

export function huntIndexScopeLabel(value: HuntIndexScope): string {
  return HUNT_INDEX_SCOPE_OPTIONS.find((option) => option.value === value)?.shortLabel ?? value;
}

export function toHuntIndexPattern(value: HuntIndexScope): string | undefined {
  return value === 'all' ? undefined : value;
}

export interface IndexScopePickerProps {
  value: HuntIndexScope;
  onChange: (value: HuntIndexScope) => void;
  disabled?: boolean;
}

export function IndexScopePicker({
  value,
  onChange,
  disabled = false,
}: IndexScopePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const selected = HUNT_INDEX_SCOPE_OPTIONS.find((option) => option.value === value)
    ?? HUNT_INDEX_SCOPE_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    // Defer attach so the opening click/mousedown cannot immediately dismiss the menu.
    const attachId = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(attachId);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = (next: HuntIndexScope): void => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="hunt-index-picker" ref={rootRef} data-open={open || undefined}>
      <button
        type="button"
        className="hunt-index-picker__trigger"
        aria-label={`Index scope: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        title="Choose which data sources this hunt queries"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="hunt-index-picker__eyebrow">Index</span>
        <span className="hunt-index-picker__value">
          <Database size={12} aria-hidden="true" />
          <strong>{selected.shortLabel}</strong>
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          className="hunt-index-picker__menu"
          role="menu"
          aria-label="Index scope"
        >
          <header className="hunt-index-picker__menu-head">
            <strong>Data source scope</strong>
            <span>Applies on the next Run search</span>
          </header>
          {HUNT_INDEX_SCOPE_OPTIONS.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                className="hunt-index-picker__option"
                data-selected={isSelected || undefined}
                onClick={() => handleSelect(option.value)}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
                {isSelected ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
