import { Filter, X } from 'lucide-react';

export interface PivotFiltersShelfProps {
  /** Active pivot-local filter clauses (safely-quoted KQL fragments). */
  filters: string[];
  /** Remove one filter by index. */
  onRemove: (index: number) => void;
  /** Clear all pivot-local filters. */
  onClear: () => void;
}

/**
 * Pivot-local Filters shelf (P1.1).
 *
 * <p>Renders the pivot-only scratch filters as removable chips. These narrow ONLY the crosstab —
 * they are AND-ed into the crosstab request query by {@link HuntPivotView} and never touch the
 * committed hunt query (Table/Metrics are unaffected). Ephemeral: not persisted in P1.1. Renders
 * nothing when there are no active filters.
 */
export function PivotFiltersShelf({ filters, onRemove, onClear }: PivotFiltersShelfProps): JSX.Element | null {
  if (filters.length === 0) return null;

  return (
    <div className="pivot-filters" aria-label="Pivot-local filters">
      <span className="pivot-filters__label">
        <Filter size={12} aria-hidden="true" /> Pivot filters
      </span>
      <ul className="pivot-filters__chips" role="list">
        {filters.map((clause, index) => (
          <li key={`${clause}-${index}`} className="pivot-filters__chip">
            <code>{clause}</code>
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remove pivot filter ${clause}`}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="pivot-filters__clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
