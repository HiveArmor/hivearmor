/**
 * WidgetContainer — Individual widget wrapper for GridStack
 * Session S32 — Dashboard Studio widget wrapper
 */

import { useState } from 'react';

import { TrashIcon } from '@patternfly/react-icons';

export interface WidgetContainerProps {
  id: string;
  name: string;
  type: string;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

export function WidgetContainer({
  id,
  name,
  type,
  isSelected,
  isEditMode,
  onClick,
  onRemove,
  children,
}: WidgetContainerProps): JSX.Element {
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);

  const handleRemoveClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setShowConfirmRemove(true);
  };

  const handleConfirmRemove = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onRemove();
    setShowConfirmRemove(false);
  };

  const handleCancelRemove = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setShowConfirmRemove(false);
  };

  return (
    <div
      className="grid-stack-item"
      data-gs-id={id}
      onClick={onClick}
      style={{
        cursor: isEditMode ? 'pointer' : 'default',
      }}
    >
      <div
        className="grid-stack-item-content"
        style={{
          backgroundColor: 'var(--ha-surface-primary)',
          border: isSelected ? '1px solid var(--ha-primary)' : '1px solid var(--ha-border)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Widget header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'var(--ha-surface-raised)',
            borderBottom: '1px solid var(--ha-border)',
          }}
        >
          {isEditMode && (
            <div
              className="widget-drag-handle"
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                color: 'var(--ha-text-secondary)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="3" cy="3" r="1" fill="currentColor" />
                <circle cx="9" cy="3" r="1" fill="currentColor" />
                <circle cx="3" cy="9" r="1" fill="currentColor" />
                <circle cx="9" cy="9" r="1" fill="currentColor" />
              </svg>
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={name}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 'var(--ha-text-xs)',
                color: 'var(--ha-text-secondary)',
              }}
            >
              {type}
            </div>
          </div>
          {isEditMode && !showConfirmRemove && (
            <button
              onClick={handleRemoveClick}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: 'var(--ha-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--ha-critical)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--ha-text-secondary)';
              }}
              aria-label="Remove widget"
            >
              <TrashIcon />
            </button>
          )}
        </div>

        {/* Inline remove confirmation */}
        {showConfirmRemove && (
          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--ha-surface-raised)',
              borderBottom: '1px solid var(--ha-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', flex: 1 }}>
              Remove this widget?
            </span>
            <button
              onClick={handleCancelRemove}
              style={{
                padding: '4px 12px',
                fontSize: 'var(--ha-text-sm)',
                border: '1px solid var(--ha-border)',
                borderRadius: '4px',
                backgroundColor: 'var(--ha-surface-primary)',
                color: 'var(--ha-text-primary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRemove}
              style={{
                padding: '4px 12px',
                fontSize: 'var(--ha-text-sm)',
                border: '1px solid var(--ha-critical)',
                borderRadius: '4px',
                backgroundColor: 'var(--ha-critical)',
                color: 'var(--ha-foreground-on-action)',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        )}

        {/* Widget body */}
        <div
          style={{
            flex: 1,
            padding: '12px',
            overflow: 'auto',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
