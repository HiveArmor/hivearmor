/**
 * RowActionsCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.9
 * Kebab "…" menu; visible on row hover.
 */

import { useRef, useState } from 'react';

import { MoreHorizontal } from 'lucide-react';

import type { QueueItem } from '@/types/alert.types';

export interface RowActionsCellProps {
  data?: QueueItem;
}

interface MenuItem {
  label: string;
  danger?: boolean;
  divider?: boolean;
  onClick: () => void;
}

export function RowActionsCell({ data }: RowActionsCellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!data) return <span />;

  const items: MenuItem[] = [
    { label: 'Assign to me', onClick: () => { setOpen(false); } },
    { label: 'Change status', onClick: () => { setOpen(false); } },
    { label: 'Open in full page', onClick: () => { setOpen(false); } },
    // divider before destructive actions
    { label: '──────────', divider: true, onClick: () => {} },
    ...(data.type === 'alert' || data.type === 'correlated_group'
      ? [{ label: 'Convert to incident', onClick: () => { setOpen(false); } }]
      : []),
    { label: 'Add note', onClick: () => { setOpen(false); } },
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
          {/* Click-away backdrop */}
          <span
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
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
            {items.map((item, i) =>
              item.divider ? (
                <hr
                  key={i}
                  style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--ha-border)' }}
                />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); item.onClick(); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 'var(--ha-text-sm)',
                    color: item.danger ? 'var(--ha-critical)' : 'var(--ha-text-primary)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--ha-surface-primary)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  {item.label}
                </button>
              )
            )}
          </div>
        </>
      )}
    </span>
  );
}
