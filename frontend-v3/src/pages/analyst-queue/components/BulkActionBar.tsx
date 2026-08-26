/**
 * BulkActionBar — kept for composition; QueueToolbar embeds the live bulk strip.
 * Labels match ALERT_MUTATION_AUTH / ASSIGNMENT_AUTH human copy.
 */

import { QUEUE_ASSIGN_DENIED, QUEUE_TRIAGE_DENIED } from '../analystQueue.capabilities';

export interface BulkActionBarProps {
  selectedCount: number;
  onAction: (action: 'REVIEWED' | 'FALSE_POSITIVE' | 'ESCALATE' | 'ASSIGN') => void;
  onDeselectAll: () => void;
  canTriage: boolean;
  canAssign: boolean;
}

export function BulkActionBar({
  selectedCount,
  onAction,
  onDeselectAll,
  canTriage,
  canAssign,
}: BulkActionBarProps): JSX.Element {
  return (
    <div className="aq-toolbar__bulk" aria-live="polite">
      <span className="aq-toolbar__selected">{selectedCount} selected</span>
      <button
        type="button"
        className="aq-bulk-btn"
        onClick={() => onAction('REVIEWED')}
        disabled={!canTriage}
        title={canTriage ? undefined : QUEUE_TRIAGE_DENIED}
      >
        Mark reviewed
      </button>
      <button
        type="button"
        className="aq-bulk-btn"
        onClick={() => onAction('FALSE_POSITIVE')}
        disabled={!canTriage}
        title={canTriage ? undefined : QUEUE_TRIAGE_DENIED}
      >
        False positive
      </button>
      <button
        type="button"
        className="aq-bulk-btn aq-bulk-btn--primary"
        onClick={() => onAction('ESCALATE')}
        disabled={!canTriage}
        title={canTriage ? undefined : QUEUE_TRIAGE_DENIED}
      >
        Escalate to incident
      </button>
      <button
        type="button"
        className="aq-bulk-btn"
        onClick={() => onAction('ASSIGN')}
        disabled={!canAssign}
        title={canAssign ? undefined : QUEUE_ASSIGN_DENIED}
      >
        Assign
      </button>
      <button type="button" className="aq-toolbar__deselect" onClick={onDeselectAll}>
        Deselect
      </button>
    </div>
  );
}
