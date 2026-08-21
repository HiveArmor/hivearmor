/**
 * FilterChipsRow — Dismissible filter chip row
 * Shown below toolbar when any filter is active
 */

import './FilterChipsRow.css';

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface FilterChipsRowProps {
  chips: FilterChip[];
  onClearAll: () => void;
}

export function FilterChipsRow({ chips, onClearAll }: FilterChipsRowProps): JSX.Element | null {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="filter-chips-row">
      {chips.map((chip) => (
        <div key={chip.key} className="filter-chip">
          <span className="filter-chip__label">{chip.label}</span>
          <button
            type="button"
            className="filter-chip__remove"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="filter-chips-row__clear-all" onClick={onClearAll}>
        Clear all
      </button>
    </div>
  );
}
