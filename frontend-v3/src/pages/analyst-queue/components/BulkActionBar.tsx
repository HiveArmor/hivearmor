/**
 * BulkActionBar — S16 per CMD-02 spec §5.2
 * Bulk action controls shown when rows are selected
 * Note: This is embedded in QueueToolbar; kept separate for clarity
 */

export interface BulkActionBarProps {
  selectedCount: number;
  onAction: (action: 'REVIEWED' | 'FALSE_POSITIVE' | 'ESCALATE') => void;
  onDeselectAll: () => void;
  isReadOnly: boolean;
}

export function BulkActionBar({
  selectedCount,
  onAction,
  onDeselectAll,
  isReadOnly,
}: BulkActionBarProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span
        style={{
          color: 'var(--ha-primary)',
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 500,
          fontFamily: 'var(--ha-font-mono)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {selectedCount} selected
      </span>

      <button
        onClick={() => onAction('REVIEWED')}
        disabled={isReadOnly}
        title={isReadOnly ? 'Requires Analyst role or higher' : undefined}
        style={{
          padding: '6px 12px',
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          color: isReadOnly ? 'var(--ha-text-secondary)' : 'var(--ha-text-primary)',
          fontSize: 'var(--ha-text-sm)',
          cursor: isReadOnly ? 'not-allowed' : 'pointer',
          opacity: isReadOnly ? 0.6 : 1,
        }}
        type="button"
      >
        Mark as Reviewed
      </button>

      <button
        onClick={() => onAction('FALSE_POSITIVE')}
        disabled={isReadOnly}
        title={isReadOnly ? 'Requires Analyst role or higher' : undefined}
        style={{
          padding: '6px 12px',
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          color: isReadOnly ? 'var(--ha-text-secondary)' : 'var(--ha-text-primary)',
          fontSize: 'var(--ha-text-sm)',
          cursor: isReadOnly ? 'not-allowed' : 'pointer',
          opacity: isReadOnly ? 0.6 : 1,
        }}
        type="button"
      >
        Mark as False Positive
      </button>

      <button
        onClick={() => onAction('ESCALATE')}
        disabled={isReadOnly}
        title={isReadOnly ? 'Requires Analyst role or higher' : undefined}
        style={{
          padding: '6px 12px',
          background: 'var(--ha-primary)',
          border: 'none',
          borderRadius: 'var(--ha-radius-base)',
          color: 'var(--ha-foreground-on-action)',
          fontSize: 'var(--ha-text-sm)',
          fontWeight: 500,
          cursor: isReadOnly ? 'not-allowed' : 'pointer',
          opacity: isReadOnly ? 0.6 : 1,
        }}
        type="button"
      >
        Escalate to Incident
      </button>

      <button
        onClick={onDeselectAll}
        style={{
          padding: '4px 8px',
          background: 'transparent',
          border: 'none',
          color: 'var(--ha-text-secondary)',
          fontSize: 'var(--ha-text-sm)',
          cursor: 'pointer',
        }}
        type="button"
      >
        Deselect all
      </button>
    </div>
  );
}
