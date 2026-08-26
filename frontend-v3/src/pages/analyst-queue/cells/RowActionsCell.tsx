/**
 * RowActionsCell — primary triage actions for a queue row.
 * Wired via cellRendererParams from createQueueColumnDefs — no fake no-ops.
 */

import { useRef, useState } from 'react';

import { MoreHorizontal } from 'lucide-react';

import {
  QUEUE_ASSIGN_DENIED,
  QUEUE_TRIAGE_DENIED,
} from '../analystQueue.capabilities';

import type { QueueItem } from '@/types/alert.types';

export type QueueRowAction =
  | 'open'
  | 'status'
  | 'assign'
  | 'escalate'
  | 'full_page';

export interface QueueRowActionsHandlers {
  onAction: (action: QueueRowAction, item: QueueItem) => void;
  canTriage: boolean;
  canAssign: boolean;
}

export interface RowActionsCellProps {
  data?: QueueItem;
  canTriage?: boolean;
  canAssign?: boolean;
  onAction?: (action: QueueRowAction, item: QueueItem) => void;
}

interface MenuItem {
  label: string;
  action: QueueRowAction;
  disabled?: boolean;
  title?: string;
  dividerBefore?: boolean;
}

export function RowActionsCell({
  data,
  canTriage = false,
  canAssign = false,
  onAction,
}: RowActionsCellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!data) return <span />;

  const items: MenuItem[] = [
    { label: 'Open detail', action: 'open' },
    {
      label: 'Change status',
      action: 'status',
      disabled: !canTriage,
      title: canTriage ? undefined : QUEUE_TRIAGE_DENIED,
    },
    {
      label: 'Assign',
      action: 'assign',
      disabled: !canAssign,
      title: canAssign ? undefined : QUEUE_ASSIGN_DENIED,
    },
    {
      label: 'Open full page',
      action: 'full_page',
    },
    {
      label: 'Escalate to incident',
      action: 'escalate',
      disabled: !canTriage,
      title: canTriage ? undefined : QUEUE_TRIAGE_DENIED,
      dividerBefore: true,
    },
  ];

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={buttonRef}
        aria-label="Row actions"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          color: 'var(--ha-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 'var(--ha-radius-base)',
        }}
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <>
          <span
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            role="presentation"
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 200,
              minWidth: 180,
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-md)',
              boxShadow: 'var(--ha-shadow-control)',
              overflow: 'hidden',
            }}
          >
            {items.map((item) => (
              <div key={item.action}>
                {item.dividerBefore && (
                  <hr
                    style={{
                      margin: '4px 0',
                      border: 'none',
                      borderTop: '1px solid var(--ha-border)',
                    }}
                  />
                )}
                <button
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    setOpen(false);
                    onAction?.(item.action, data);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 'var(--ha-text-sm)',
                    color: item.disabled
                      ? 'var(--ha-text-secondary)'
                      : 'var(--ha-text-primary)',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.65 : 1,
                  }}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
