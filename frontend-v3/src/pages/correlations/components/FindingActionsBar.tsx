/**
 * Sprint 44 — Finding Actions Bar.
 * Status change buttons (contextual), assign dropdown, note input.
 */

import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, MessageSquare, ShieldAlert, UserRound, XCircle } from 'lucide-react';

import { addNote, assignFinding, changeStatus } from '../services/correlation.service';
import type { CorrelatedFinding, FindingStatus } from '../types/correlation.types';

function getStatusActions(status: FindingStatus): Array<{ targetStatus: FindingStatus; label: string; icon: typeof CheckCircle2 }> {
  switch (status) {
    case 'new':
      return [
        { targetStatus: 'reviewing', label: 'Start Review', icon: CheckCircle2 },
        { targetStatus: 'dismissed', label: 'Dismiss', icon: XCircle },
      ];
    case 'reviewing':
      return [
        { targetStatus: 'confirmed', label: 'Confirm', icon: CheckCircle2 },
        { targetStatus: 'dismissed', label: 'Dismiss', icon: XCircle },
      ];
    case 'confirmed':
      return [
        { targetStatus: 'reviewing', label: 'Reopen', icon: CheckCircle2 },
      ];
    case 'dismissed':
      return [
        { targetStatus: 'reviewing', label: 'Reopen', icon: CheckCircle2 },
      ];
    default:
      return [];
  }
}

export interface FindingActionsBarProps {
  finding: CorrelatedFinding;
  onStatusChange: () => void;
  onPromote: () => void;
}

export function FindingActionsBar({ finding, onStatusChange, onPromote }: FindingActionsBarProps): JSX.Element {
  const [assigneeInput, setAssigneeInput] = useState(finding.assignee ?? '');
  const [noteContent, setNoteContent] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const statusMutation = useMutation({
    mutationFn: (targetStatus: FindingStatus) => changeStatus(finding.id, targetStatus),
    onSuccess: () => onStatusChange(),
  });

  const assignMutation = useMutation({
    mutationFn: (assignee: string | null) => assignFinding(finding.id, assignee),
    onSuccess: () => onStatusChange(),
  });

  const noteMutation = useMutation({
    mutationFn: (content: string) => addNote(finding.id, content),
    onSuccess: () => {
      setNoteContent('');
      setShowNoteInput(false);
    },
  });

  const statusActions = getStatusActions(finding.status);
  const canPromote = finding.status === 'reviewing' || finding.status === 'confirmed';

  return (
    <div className="finding-actions-bar">
      <div className="finding-actions-bar__status">
        <span className="finding-actions-bar__current-status" data-status={finding.status}>
          {finding.status}
        </span>
        {statusActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.targetStatus}
              type="button"
              className="finding-actions-bar__action-btn"
              onClick={() => statusMutation.mutate(action.targetStatus)}
              disabled={statusMutation.isPending}
            >
              <Icon size={14} aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
        {canPromote && (
          <button
            type="button"
            className="finding-actions-bar__promote-btn"
            onClick={onPromote}
          >
            <ShieldAlert size={14} aria-hidden="true" />
            Promote to Incident
          </button>
        )}
      </div>

      <div className="finding-actions-bar__assign">
        <UserRound size={14} aria-hidden="true" />
        <input
          type="text"
          value={assigneeInput}
          onChange={(e) => setAssigneeInput(e.target.value)}
          placeholder="Assign to…"
          aria-label="Assignee"
          className="finding-actions-bar__assign-input"
        />
        <button
          type="button"
          onClick={() => assignMutation.mutate(assigneeInput || null)}
          disabled={assignMutation.isPending}
          className="finding-actions-bar__assign-btn"
        >
          {assignMutation.isPending ? 'Saving…' : 'Assign'}
        </button>
      </div>

      <div className="finding-actions-bar__notes">
        {!showNoteInput ? (
          <button
            type="button"
            className="finding-actions-bar__note-toggle"
            onClick={() => setShowNoteInput(true)}
          >
            <MessageSquare size={14} aria-hidden="true" />
            Add Note
          </button>
        ) : (
          <div className="finding-actions-bar__note-form">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write a note…"
              aria-label="Note content"
              rows={3}
            />
            <div className="finding-actions-bar__note-actions">
              <button
                type="button"
                onClick={() => setShowNoteInput(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => noteMutation.mutate(noteContent)}
                disabled={!noteContent.trim() || noteMutation.isPending}
              >
                {noteMutation.isPending ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
