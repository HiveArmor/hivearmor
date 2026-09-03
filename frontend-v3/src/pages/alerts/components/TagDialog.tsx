import { useCallback, useEffect, useRef, useState } from 'react';

import { X } from 'lucide-react';

import { HaModal } from '@/components/ha-modal/HaModal';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { ApiError, apiClient } from '@/lib/apiClient';

interface TagDialogProps {
  alertId: string;
  currentTags: string[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function TagDialog({ alertId, currentTags, onSuccess, onCancel }: TagDialogProps): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const [removedTags, setRemovedTags] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((state) => state.addToast);

  const handleCancel = useCallback(() => {
    if (!submitting) onCancel();
  }, [submitting, onCancel]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleRemoveTag = (tag: string): void => {
    setRemovedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const parseNewTags = (): string[] => {
    return inputValue
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && tag.length <= 50)
      .filter((tag) => !currentTags.includes(tag));
  };

  const validateInput = (): string | null => {
    const tags = inputValue.split(',').map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) {
      if (tag.length > 50) return `Tag "${tag.slice(0, 20)}…" exceeds 50 characters`;
      if (tag.length === 0) return 'Empty tags are not allowed';
    }
    return null;
  };

  const handleSubmit = async (): Promise<void> => {
    if (submitting) return;

    const validationError = validateInput();
    if (validationError) {
      setError(validationError);
      return;
    }

    const addTags = parseNewTags();
    const removeTags = Array.from(removedTags);

    if (addTags.length === 0 && removeTags.length === 0) {
      setError('No changes to apply');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiClient.post(
        `/ha-alerts/${encodeURIComponent(alertId)}/tags`,
        { addTags, removeTags }
      );

      addToast({ variant: 'success', title: 'Tags updated' });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body.detail ?? err.body.message ?? 'Failed to update tags');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const newTags = parseNewTags();
  const hasChanges = newTags.length > 0 || removedTags.size > 0;

  return (
    <HaModal isOpen onClose={handleCancel} title="Manage tags" width={480}>
      <div className="ha-dialog-body">
        {currentTags.length > 0 && (
            <div className="tag-dialog-current">
              <span className="ha-dialog-label">Current tags</span>
              <div className="tag-dialog-chips">
                {currentTags.map((tag) => (
                  <span
                    key={tag}
                    className="tag-dialog-chip"
                    data-removed={removedTags.has(tag)}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => toggleRemoveTag(tag)}
                      aria-label={removedTags.has(tag) ? `Restore tag ${tag}` : `Remove tag ${tag}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <label className="ha-dialog-field">
            <span className="ha-dialog-label">Add new tags <em>(comma-separated, max 50 chars each)</em></span>
            <input
              ref={inputRef}
              className="tag-dialog-input"
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setError(null); }}
              placeholder="lateral-movement, high-priority, review-needed"
              disabled={submitting}
            />
          </label>

          {newTags.length > 0 && (
            <div className="tag-dialog-preview">
              <span className="ha-dialog-label">Tags to add</span>
              <div className="tag-dialog-chips">
                {newTags.map((tag) => (
                  <span key={tag} className="tag-dialog-chip tag-dialog-chip--new">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="ha-dialog-error" role="alert">{error}</div>
          )}
      </div>

      <footer className="ha-dialog-footer">
        <button
          type="button"
          className="ha-dialog-btn ha-dialog-btn--secondary"
          onClick={handleCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ha-dialog-btn ha-dialog-btn--primary"
          onClick={() => void handleSubmit()}
          disabled={!hasChanges || submitting}
        >
          {submitting ? 'Applying…' : 'Apply tags'}
        </button>
      </footer>

      <style>{`
        .ha-dialog-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ha-dialog-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ha-dialog-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--ha-foreground-secondary);
        }
        .ha-dialog-label em {
          font-weight: 400;
          font-style: normal;
          opacity: 0.7;
        }
        .ha-dialog-error {
          padding: 8px 12px;
          background: color-mix(in srgb, var(--ha-severity-critical) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--ha-severity-critical) 30%, transparent);
          border-radius: 6px;
          font-size: 12px;
          color: var(--ha-severity-critical);
        }
        .ha-dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        .ha-dialog-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .ha-dialog-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ha-dialog-btn--primary {
          background: var(--ha-action-primary);
          color: var(--ha-foreground-on-action);
          border: none;
        }
        .ha-dialog-btn--primary:hover:not(:disabled) { opacity: 0.9; }
        .ha-dialog-btn--secondary {
          background: transparent;
          border: 1px solid var(--ha-border-default);
          color: var(--ha-foreground-secondary);
        }
        .ha-dialog-btn--secondary:hover:not(:disabled) {
          border-color: var(--ha-border-strong);
          color: var(--ha-foreground-primary);
        }
        .tag-dialog-current {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tag-dialog-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tag-dialog-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: var(--ha-surface-elevated);
          border: 1px solid var(--ha-border-default);
          border-radius: 4px;
          font-size: 12px;
          color: var(--ha-foreground-primary);
        }
        .tag-dialog-chip[data-removed="true"] {
          opacity: 0.4;
          text-decoration: line-through;
        }
        .tag-dialog-chip--new {
          border-color: var(--ha-action-primary);
          background: color-mix(in srgb, var(--ha-action-primary) 10%, transparent);
        }
        .tag-dialog-chip button {
          background: transparent;
          border: none;
          color: var(--ha-foreground-tertiary);
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
        }
        .tag-dialog-chip button:hover { color: var(--ha-severity-critical); }
        .tag-dialog-input {
          width: 100%;
          padding: 8px 12px;
          background: var(--ha-surface-input);
          border: 1px solid var(--ha-border-default);
          border-radius: 6px;
          color: var(--ha-foreground-primary);
          font-size: 13px;
          font-family: inherit;
        }
        .tag-dialog-input:focus {
          outline: none;
          border-color: var(--ha-border-focus);
        }
        .tag-dialog-input::placeholder { color: var(--ha-foreground-tertiary); }
        .tag-dialog-preview {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>
    </HaModal>
  );
}
