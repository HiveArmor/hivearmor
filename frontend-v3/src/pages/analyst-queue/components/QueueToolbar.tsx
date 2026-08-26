/**
 * QueueToolbar — compact severity/status chip strip + bulk triage actions.
 * Bulk status uses confirmed POST /api/ha-alerts/status (alertIds[]).
 */

import { useMemo } from 'react';

import {
  QUEUE_ASSIGN_DENIED,
  QUEUE_BULK_STATUS_SUPPORTED,
  QUEUE_TRIAGE_DENIED,
} from '../analystQueue.capabilities';
import type { QueueFilters } from '../analystQueue.types';

import type { AlertStatus } from '@/constants/status.constants';
import type { SeverityLevel } from '@/lib/severity';

const SEVERITY_OPTIONS: { value: SeverityLevel; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_OPTIONS: { value: AlertStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_positive', label: 'False Positive' },
];

export interface QueueToolbarProps {
  filters: QueueFilters;
  onFiltersChange: (filters: QueueFilters) => void;
  selectedCount: number;
  onBulkAction: (action: 'REVIEWED' | 'FALSE_POSITIVE' | 'ESCALATE' | 'ASSIGN') => void;
  onDeselectAll: () => void;
  canTriage: boolean;
  canAssign: boolean;
}

function toggleValue<T extends string>(current: T[] | undefined, value: T): T[] | undefined {
  const set = new Set(current ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  const next = Array.from(set);
  return next.length > 0 ? next : undefined;
}

export function QueueToolbar({
  filters,
  onFiltersChange,
  selectedCount,
  onBulkAction,
  onDeselectAll,
  canTriage,
  canAssign,
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

  const triageTitle = canTriage ? undefined : QUEUE_TRIAGE_DENIED;
  const assignTitle = canAssign ? undefined : QUEUE_ASSIGN_DENIED;

  return (
    <div className="aq-toolbar" role="toolbar" aria-label="Queue filters and bulk actions">
      <div className="aq-toolbar__filters">
        {/* Status first — Elastic/Defender queue convention; default open + in_progress */}
        <div className="aq-chip-group">
          <span className="aq-chip-group__label">Status</span>
          <div className="aq-chip-strip" role="group" aria-label="Status filters">
            {STATUS_OPTIONS.map((opt) => {
              const active = filters.status?.includes(opt.value) ?? false;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="aq-chip"
                  data-active={active}
                  data-status={opt.value}
                  aria-pressed={active}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      status: toggleValue(filters.status, opt.value),
                    })
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="aq-chip-group">
          <span className="aq-chip-group__label">Severity</span>
          <div className="aq-chip-strip" role="group" aria-label="Severity filters">
            {SEVERITY_OPTIONS.map((opt) => {
              const active = filters.severity?.includes(opt.value) ?? false;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="aq-chip"
                  data-active={active}
                  data-severity={opt.value}
                  aria-pressed={active}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      severity: toggleValue(filters.severity, opt.value),
                    })
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <input
          type="search"
          className="aq-toolbar__search"
          placeholder="Search alerts…"
          value={filters.q ?? ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, q: e.target.value || undefined })
          }
          aria-label="Search queue"
        />

        {hasActiveFilters && (
          <button
            type="button"
            className="aq-toolbar__clear"
            onClick={() => onFiltersChange({})}
          >
            Clear filters
          </button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="aq-toolbar__bulk" aria-live="polite">
          <span className="aq-toolbar__selected">{selectedCount} selected</span>

          {QUEUE_BULK_STATUS_SUPPORTED ? (
            <>
              <button
                type="button"
                className="aq-bulk-btn"
                onClick={() => onBulkAction('REVIEWED')}
                disabled={!canTriage}
                title={triageTitle}
              >
                Mark reviewed
              </button>
              <button
                type="button"
                className="aq-bulk-btn"
                onClick={() => onBulkAction('FALSE_POSITIVE')}
                disabled={!canTriage}
                title={triageTitle}
              >
                False positive
              </button>
              <button
                type="button"
                className="aq-bulk-btn aq-bulk-btn--primary"
                onClick={() => onBulkAction('ESCALATE')}
                disabled={!canTriage}
                title={triageTitle}
              >
                Escalate to incident
              </button>
              <button
                type="button"
                className="aq-bulk-btn"
                onClick={() => onBulkAction('ASSIGN')}
                disabled={!canAssign}
                title={assignTitle}
              >
                Assign
              </button>
            </>
          ) : (
            <span className="aq-toolbar__honesty">
              Bulk triage unavailable — backend does not expose a multi-alert mutate contract.
            </span>
          )}

          <button type="button" className="aq-toolbar__deselect" onClick={onDeselectAll}>
            Deselect
          </button>
        </div>
      )}
    </div>
  );
}
