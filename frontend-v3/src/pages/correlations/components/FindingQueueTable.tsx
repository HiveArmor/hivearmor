/**
 * Sprint 44 — Finding Queue Table.
 * Columns: severity, title, stages, signals, lead entity, tactics, assignee, created.
 */

import { ShieldAlert, UserRound } from 'lucide-react';

import type { FindingPreview } from '../types/correlation.types';

import { getSeverityLabel } from '@/lib/severity';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface FindingQueueTableProps {
  items: FindingPreview[];
  onRowClick: (findingId: string) => void;
}

export function FindingQueueTable({ items, onRowClick }: FindingQueueTableProps): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="finding-queue-table__empty">
        <p>No correlated findings match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="finding-queue-table" role="table" aria-label="Correlated findings queue">
      <div className="finding-queue-table__header" role="row">
        <span role="columnheader" className="finding-queue-table__col--severity">Severity</span>
        <span role="columnheader" className="finding-queue-table__col--title">Title</span>
        <span role="columnheader" className="finding-queue-table__col--stages">Stages</span>
        <span role="columnheader" className="finding-queue-table__col--signals">Signals</span>
        <span role="columnheader" className="finding-queue-table__col--entity">Lead Entity</span>
        <span role="columnheader" className="finding-queue-table__col--tactics">Tactics</span>
        <span role="columnheader" className="finding-queue-table__col--assignee">Assignee</span>
        <span role="columnheader" className="finding-queue-table__col--created">Created</span>
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="finding-queue-table__row"
          role="row"
          onClick={() => onRowClick(item.id)}
          aria-label={`Open finding: ${item.title}`}
        >
          <span role="cell" className="finding-queue-table__col--severity" data-severity={item.severity}>
            <ShieldAlert size={14} aria-hidden="true" />
            {getSeverityLabel(item.severity)}
          </span>
          <span role="cell" className="finding-queue-table__col--title">
            <strong>{item.title}</strong>
            <code>{item.id}</code>
          </span>
          <span role="cell" className="finding-queue-table__col--stages">
            {item.attackStageCount}
          </span>
          <span role="cell" className="finding-queue-table__col--signals">
            {item.signalCount}
          </span>
          <span role="cell" className="finding-queue-table__col--entity">
            <code>{item.leadEntity.value}</code>
            <small>{item.leadEntity.type}</small>
          </span>
          <span role="cell" className="finding-queue-table__col--tactics">
            {item.mitreTactics.slice(0, 3).map((tactic) => (
              <span key={tactic} className="finding-queue-table__tactic-pill">
                {tactic}
              </span>
            ))}
            {item.mitreTactics.length > 3 && (
              <span className="finding-queue-table__tactic-pill finding-queue-table__tactic-pill--more">
                +{item.mitreTactics.length - 3}
              </span>
            )}
          </span>
          <span role="cell" className="finding-queue-table__col--assignee">
            <UserRound size={12} aria-hidden="true" />
            {item.assignee ?? 'Unassigned'}
          </span>
          <span role="cell" className="finding-queue-table__col--created">
            <time title={new Date(item.createdAt).toLocaleString()}>
              {formatTime(item.createdAt)}
            </time>
          </span>
        </button>
      ))}
    </div>
  );
}
