/**
 * FilterBar — Horizontal filter pill display for dashboard cross-filtering
 * PD-11: Additive AND stacking with persistent filter pills
 */

import { X } from 'lucide-react';

export interface FilterPill {
  id: string;
  field: string;
  value: string;
  negate: boolean;
}

export interface FilterBarProps {
  filters: FilterPill[];
  onRemove: (id: string) => void;
  onToggleNegate: (id: string) => void;
  onClearAll: () => void;
}

export function FilterBar({
  filters,
  onRemove,
  onToggleNegate,
  onClearAll,
}: FilterBarProps): JSX.Element | null {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 24px',
        background: 'var(--ha-surface-raised)',
        borderBottom: '1px solid var(--ha-border)',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 500,
          color: 'var(--ha-text-secondary)',
        }}
      >
        Filters:
      </span>

      {filters.map((filter) => (
        <div
          key={filter.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <button
            onClick={() => onToggleNegate(filter.id)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              color: filter.negate ? 'var(--ha-critical)' : 'var(--ha-text-secondary)',
              fontSize: 'var(--ha-text-xs)',
              fontWeight: 600,
              fontFamily: 'var(--ha-font-mono)',
            }}
            aria-label={`Toggle NOT for ${filter.field}`}
            title={filter.negate ? 'Remove NOT' : 'Add NOT'}
          >
            {filter.negate ? 'NOT' : '·'}
          </button>

          <span style={{ color: 'var(--ha-text-secondary)' }}>{filter.field}:</span>

          <span
            style={{
              color: 'var(--ha-text-primary)',
              fontFamily: 'var(--ha-font-mono)',
              fontWeight: 500,
            }}
          >
            {filter.value}
          </span>

          <button
            onClick={() => onRemove(filter.id)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: 'var(--ha-text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label={`Remove ${filter.field} filter`}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {filters.length > 1 && (
        <button
          onClick={onClearAll}
          style={{
            background: 'transparent',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '4px 10px',
            color: 'var(--ha-text-secondary)',
            fontSize: 'var(--ha-text-xs)',
            cursor: 'pointer',
            fontWeight: 500,
            marginLeft: '8px',
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
