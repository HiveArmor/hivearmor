/**
 * SavedViewsPanel — S16 per CMD-02 spec §5.4
 * Saved views menu for filter/column/sort state persistence
 */

import { useState } from 'react';

import type { QueueFilters } from '../analystQueue.types';

export interface SavedView {
  id: string;
  name: string;
  filters: QueueFilters;
  columnVisibility?: Record<string, boolean>;
  sortColumn?: string;
  timeRange?: { from: string; to: string };
}

export interface SavedViewsPanelProps {
  views: SavedView[];
  activeViewId?: string;
  onSelect: (view: SavedView) => void;
  onSave: (name: string) => void;
  onDelete: (viewId: string) => void;
  isReadOnly: boolean;
}

export function SavedViewsPanel({
  views,
  activeViewId,
  onSelect,
  onSave,
  onDelete,
  isReadOnly,
}: SavedViewsPanelProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [isSaveMode, setIsSaveMode] = useState(false);

  const handleSave = (): void => {
    if (newViewName.trim()) {
      onSave(newViewName.trim());
      setNewViewName('');
      setIsSaveMode(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '6px 12px',
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          color: 'var(--ha-text-primary)',
          fontSize: 'var(--ha-text-sm)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        type="button"
      >
        Saved Views
        {views.length > 0 && (
          <span
            style={{
              background: 'var(--ha-primary)',
              color: 'var(--ha-foreground-on-action)',
              padding: '2px 6px',
              borderRadius: 'var(--ha-radius-sm)',
              fontSize: 'var(--ha-text-xs)',
              fontWeight: 500,
            }}
          >
            {views.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            minWidth: '280px',
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            boxShadow: 'var(--ha-shadow-control)',
            zIndex: 100,
            padding: '8px 0',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--ha-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 600,
                color: 'var(--ha-text-primary)',
              }}
            >
              Saved Views
            </span>
            {!isReadOnly && (
              <button
                onClick={() => setIsSaveMode(!isSaveMode)}
                style={{
                  padding: '4px 8px',
                  background: 'var(--ha-primary)',
                  border: 'none',
                  borderRadius: 'var(--ha-radius-sm)',
                  color: 'var(--ha-foreground-on-action)',
                  fontSize: 'var(--ha-text-xs)',
                  cursor: 'pointer',
                }}
                type="button"
              >
                {isSaveMode ? 'Cancel' : 'Save Current'}
              </button>
            )}
          </div>

          {/* Save new view form */}
          {isSaveMode && (
            <div style={{ padding: '12px', borderBottom: '1px solid var(--ha-border)' }}>
              <input
                type="text"
                placeholder="View name..."
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--ha-surface-primary)',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 'var(--ha-radius-base)',
                  color: 'var(--ha-text-primary)',
                  fontSize: 'var(--ha-text-sm)',
                  marginBottom: '8px',
                }}
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={!newViewName.trim()}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: 'var(--ha-primary)',
                  border: 'none',
                  borderRadius: 'var(--ha-radius-base)',
                  color: 'var(--ha-foreground-on-action)',
                  fontSize: 'var(--ha-text-sm)',
                  cursor: newViewName.trim() ? 'pointer' : 'not-allowed',
                  opacity: newViewName.trim() ? 1 : 0.6,
                }}
                type="button"
              >
                Save View
              </button>
            </div>
          )}

          {/* Views list */}
          {views.length === 0 && !isSaveMode && (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: 'var(--ha-text-secondary)',
                fontSize: 'var(--ha-text-sm)',
              }}
            >
              No saved views yet
            </div>
          )}

          {views.map((view) => (
            <div
              key={view.id}
              style={{
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background:
                  activeViewId === view.id
                    ? 'var(--ha-fill-primary-subtle)'
                    : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => {
                onSelect(view);
                setIsOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelect(view);
                  setIsOpen(false);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  color: 'var(--ha-text-primary)',
                }}
              >
                {view.name}
              </span>
              {!isReadOnly && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(view.id);
                  }}
                  style={{
                    padding: '2px 6px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--ha-critical)',
                    fontSize: 'var(--ha-text-xs)',
                    cursor: 'pointer',
                  }}
                  type="button"
                  aria-label={`Delete ${view.name}`}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
