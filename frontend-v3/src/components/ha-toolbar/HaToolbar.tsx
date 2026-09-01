import type React from 'react';

import './HaToolbar.css';

export interface HaFilterChip {
  label: string;
  onRemove: () => void;
}

export interface HaToolbarProps {
  /** Left cluster — filters, saved views, primary controls. */
  left?: React.ReactNode;
  /** Right cluster — density, counts, secondary controls. */
  right?: React.ReactNode;
  /** Active filter chips shown on a second row; removable. */
  activeFilters?: HaFilterChip[];
  /** Clear-all affordance shown after the chips. */
  onClearAllFilters?: () => void;
  /**
   * Pin the strip below the masthead (default true). The locked band spec: identity scrolls away,
   * the control strip stays. Set false to let it scroll with the page.
   */
  sticky?: boolean;
  className?: string;
}

/**
 * HaToolbar — the locked sticky control strip that sits under HaPageHeader (design §8): the page
 * identity scrolls away, this strip pins at `top: var(--ha-masthead-height)`. Rebuilt from the dead
 * `SiemToolbar` (which had no consumers and a filled surface + stale-alias tokens): now transparent
 * to match the no-fill band, tokens-corrected, sticky by default.
 *
 * The removable filter chip here is the future `HaChip` extraction site (deferred until 3× — plan §5b).
 */
export function HaToolbar({
  left,
  right,
  activeFilters,
  onClearAllFilters,
  sticky = true,
  className = '',
}: HaToolbarProps): JSX.Element {
  return (
    <div
      className={['ha-toolbar', sticky ? 'ha-toolbar--sticky' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="ha-toolbar__row">
        <div className="ha-toolbar__left">{left}</div>
        <div className="ha-toolbar__right">{right}</div>
      </div>

      {activeFilters && activeFilters.length > 0 && (
        <div className="ha-toolbar__filters">
          {activeFilters.map((filter, index) => (
            <span className="ha-toolbar__chip" key={`${filter.label}-${index}`}>
              <span>{filter.label}</span>
              <button
                type="button"
                className="ha-toolbar__chip-remove"
                onClick={filter.onRemove}
                aria-label={`Remove filter ${filter.label}`}
              >
                ×
              </button>
            </span>
          ))}
          {onClearAllFilters && (
            <button type="button" className="ha-toolbar__clear" onClick={onClearAllFilters}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
