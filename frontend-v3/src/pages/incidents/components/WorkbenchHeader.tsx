/**
 * WorkbenchHeader — Editable incident metadata with ETag-based optimistic concurrency.
 * Shows conflict resolution modal on 409.
 */

import { useCallback, useRef, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Pencil, X } from 'lucide-react';

import type { PatchIncidentResult } from '../services/incident-workbench.service';
import { patchIncident } from '../services/incident-workbench.service';
import type { ConflictResponse, IncidentPatch } from '../types/incident-workbench.types';

import { ApiError } from '@/lib/apiClient';

export interface WorkbenchHeaderProps {
  incidentId: string;
  title: string;
  description: string | null;
  assignee: string | null;
  version: number;
}

interface ConflictState {
  response: ConflictResponse;
  pendingPatch: IncidentPatch;
}

export function WorkbenchHeader({
  incidentId,
  title,
  description,
  assignee,
  version,
}: WorkbenchHeaderProps): JSX.Element {
  const queryClient = useQueryClient();
  const [etag, setEtag] = useState<string>(String(version));
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patchMutation = useMutation({
    mutationFn: (patch: IncidentPatch) => patchIncident(incidentId, patch, etag),
    onSuccess: (result: PatchIncidentResult) => {
      setEtag(result.etag);
      setConflictState(null);
      void queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      setEditingField(null);
    },
    onError: (error: Error, patch: IncidentPatch) => {
      if (error instanceof ApiError && error.status === 409) {
        const body = error.body as unknown as ConflictResponse;
        setConflictState({ response: body, pendingPatch: patch });
      }
      setEditingField(null);
    },
  });

  const startEdit = useCallback((field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingField || patchMutation.isPending) return;
    const patch: IncidentPatch = { [editingField]: editValue };
    patchMutation.mutate(patch);
  }, [editingField, editValue, patchMutation]);

  const resolveConflict = useCallback(
    (choice: 'mine' | 'theirs') => {
      if (!conflictState) return;
      if (choice === 'theirs') {
        // Accept server version, refetch
        setEtag(String(conflictState.response.serverVersion));
        void queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
      } else {
        // Retry with server version
        setEtag(String(conflictState.response.serverVersion));
        patchMutation.mutate(conflictState.pendingPatch);
      }
      setConflictState(null);
    },
    [conflictState, incidentId, patchMutation, queryClient]
  );

  return (
    <div className="workbench-header" role="region" aria-label="Incident metadata">
      <div className="workbench-header__field">
        <label className="workbench-header__label">Title</label>
        {editingField === 'title' ? (
          <div className="workbench-header__edit-row">
            <input
              ref={inputRef}
              className="workbench-header__input"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              aria-label="Edit incident title"
            />
            <button
              className="workbench-header__action-btn"
              type="button"
              onClick={saveEdit}
              disabled={patchMutation.isPending}
              aria-label="Save title"
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              className="workbench-header__action-btn"
              type="button"
              onClick={cancelEdit}
              aria-label="Cancel editing"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            className="workbench-header__value workbench-header__value--editable"
            type="button"
            onClick={() => startEdit('title', title)}
            aria-label="Click to edit title"
          >
            <span>{title}</span>
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="workbench-header__field">
        <label className="workbench-header__label">Description</label>
        {editingField === 'description' ? (
          <div className="workbench-header__edit-row">
            <input
              ref={inputRef}
              className="workbench-header__input"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              aria-label="Edit incident description"
            />
            <button
              className="workbench-header__action-btn"
              type="button"
              onClick={saveEdit}
              disabled={patchMutation.isPending}
              aria-label="Save description"
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              className="workbench-header__action-btn"
              type="button"
              onClick={cancelEdit}
              aria-label="Cancel editing"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            className="workbench-header__value workbench-header__value--editable"
            type="button"
            onClick={() => startEdit('description', description ?? '')}
            aria-label="Click to edit description"
          >
            <span>{description || 'No description'}</span>
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="workbench-header__field">
        <label className="workbench-header__label">Assignee</label>
        {editingField === 'assignee' ? (
          <div className="workbench-header__edit-row">
            <input
              ref={inputRef}
              className="workbench-header__input"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              aria-label="Edit assignee"
            />
            <button
              className="workbench-header__action-btn"
              type="button"
              onClick={saveEdit}
              disabled={patchMutation.isPending}
              aria-label="Save assignee"
            >
              <Check size={14} aria-hidden="true" />
            </button>
            <button
              className="workbench-header__action-btn"
              type="button"
              onClick={cancelEdit}
              aria-label="Cancel editing"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            className="workbench-header__value workbench-header__value--editable"
            type="button"
            onClick={() => startEdit('assignee', assignee ?? '')}
            aria-label="Click to edit assignee"
          >
            <span>{assignee || 'Unassigned'}</span>
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {patchMutation.isPending && (
        <span className="workbench-header__saving" aria-live="polite">Saving…</span>
      )}

      {/* Conflict Resolution Modal */}
      {conflictState && (
        <div className="workbench-header__conflict-overlay" role="dialog" aria-modal="true" aria-label="Conflict resolution">
          <div className="workbench-header__conflict-modal">
            <div className="workbench-header__conflict-title">
              <AlertTriangle size={16} aria-hidden="true" />
              <strong>Edit conflict</strong>
            </div>
            <p className="workbench-header__conflict-desc">
              Another user changed this incident while you were editing. Choose which version to keep.
            </p>
            <div className="workbench-header__conflict-fields">
              {Object.entries(conflictState.response.fields).map(([field, conflict]) => (
                <div className="workbench-header__conflict-field" key={field}>
                  <span className="workbench-header__conflict-label">{field}</span>
                  <div className="workbench-header__conflict-diff">
                    <span>Your change: <strong>{conflict.yours ?? '(none)'}</strong></span>
                    <span>Their change: <strong>{conflict.theirs ?? '(none)'}</strong></span>
                    <span>Original: {conflict.base ?? '(none)'}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="workbench-header__conflict-actions">
              <button
                className="workbench-header__conflict-btn"
                type="button"
                onClick={() => resolveConflict('mine')}
                data-variant="primary"
              >
                Keep my changes
              </button>
              <button
                className="workbench-header__conflict-btn"
                type="button"
                onClick={() => resolveConflict('theirs')}
              >
                Accept their changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
