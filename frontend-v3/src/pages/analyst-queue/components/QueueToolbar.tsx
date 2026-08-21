/**
 * QueueToolbar — S16 per CMD-02 spec §5
 * Filter controls + bulk action bar + columns toggle
 */

import { useMemo } from 'react';

import type { QueueFilters } from '../analystQueue.types';

import type { AlertStatus } from '@/constants/status.constants';
import type { SeverityLevel } from '@/lib/severity';

export interface QueueToolbarProps {
  filters: QueueFilters;
  onFiltersChange: (filters: QueueFilters) => void;
  selectedCount: number;
  onBulkAction: (action: 'REVIEWED' | 'FALSE_POSITIVE' | 'ESCALATE') => void;
  onDeselectAll: () => void;
  isReadOnly: boolean;
}

export function QueueToolbar({
  filters,
  onFiltersChange,
  selectedCount,
  onBulkAction,
  onDeselectAll,
  isReadOnly,
}: QueueToolbarProps): JSX.Element {
  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.severity?.length ||
          filters.status?.length ||
          filters.category?.length ||
          filters.assignedTo ||
          filters.q
      ),
    [filters]
  );

  const handleClearFilters = (): void => {
    onFiltersChange({});
  };

  const handleSeverityChange = (severity: SeverityLevel[]): void => {
    onFiltersChange({ ...filters, severity });
  };

  const handleStatusChange = (status: AlertStatus[]): void => {
    onFiltersChange({ ...filters, status });
  };

  const handleSearchChange = (q: string): void => {
    onFiltersChange({ ...filters, q: q || undefined });
  };

  return (
    <div
      style={{
        padding: '8px 24px',
        background: 'var(--ha-surface-raised)',
        borderBottom: '1px solid var(--ha-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minHeight: '44px',
      }}
    >
      {/* Left side: Filter controls */}
      <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
        <select
          value=""
          onChange={(e) => {
            const val = e.target.value as SeverityLevel;
            if (val) {
              handleSeverityChange([...(filters.severity ?? []), val]);
            }
          }}
          style={{
            padding: '4px 8px',
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <option value="">Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value=""
          onChange={(e) => {
            const val = e.target.value as AlertStatus;
            if (val) {
              handleStatusChange([...(filters.status ?? []), val]);
            }
          }}
          style={{
            padding: '4px 8px',
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <option value="">Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>

        <input
          type="text"
          placeholder="Search alerts..."
          value={filters.q ?? ''}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{
            padding: '4px 12px',
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 'var(--ha-text-sm)',
            minWidth: '200px',
          }}
        />

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--ha-primary)',
              fontSize: 'var(--ha-text-sm)',
              cursor: 'pointer',
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Right side: Bulk action bar (conditional) */}
      {selectedCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginLeft: 'auto',
          }}
        >
          <span
            style={{
              color: 'var(--ha-primary)',
              fontSize: 'var(--ha-text-sm)',
              fontWeight: 500,
            }}
          >
            {selectedCount} selected
          </span>

          <button
            onClick={() => onBulkAction('REVIEWED')}
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
            onClick={() => onBulkAction('FALSE_POSITIVE')}
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
            onClick={() => onBulkAction('ESCALATE')}
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
      )}
    </div>
  );
}
