/**
 * SiemToolbar — Filter/action bar below page header, above data grid.
 */

export interface FilterChip {
  label: string;
  onRemove: () => void;
}

export interface SiemToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  activeFilters?: FilterChip[];
  onClearAllFilters?: () => void;
  className?: string;
}

export function SiemToolbar({
  left,
  right,
  activeFilters,
  onClearAllFilters,
  className = '',
}: SiemToolbarProps): JSX.Element {
  return (
    <div className={className}>
      <div
        style={{
          minHeight: 48,
          background: 'var(--ha-surface-primary)',
          borderBottom: '1px solid var(--ha-border)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{left}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>{right}</div>
      </div>
      {activeFilters && activeFilters.length > 0 && (
        <div
          style={{
            padding: '8px 24px',
            background: 'var(--ha-surface-primary)',
            borderBottom: '1px solid var(--ha-border)',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {activeFilters.map((filter, index) => (
            <div
              key={index}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: 'var(--ha-fill-primary-subtle)',
                border: '1px solid color-mix(in srgb, var(--ha-action-primary) 30%, transparent)',
                borderRadius: 16,
                fontSize: 'var(--ha-text-xs)',
                color: 'var(--ha-text-primary)',
              }}
            >
              <span>{filter.label}</span>
              <button
                onClick={filter.onRemove}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label={`Remove filter ${filter.label}`}
              >
                ×
              </button>
            </div>
          ))}
          {onClearAllFilters && (
            <button
              onClick={onClearAllFilters}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ha-text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--ha-text-xs)',
                textDecoration: 'underline',
                padding: '4px 8px',
              }}
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
