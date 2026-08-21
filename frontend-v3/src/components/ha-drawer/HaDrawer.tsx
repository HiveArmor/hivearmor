/**
 * HaDrawer — Right-side sliding panel for detail views.
 */

import { useEffect } from 'react';

import { X } from 'lucide-react';

export interface HaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function HaDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  width = 480,
  children,
  footer,
}: HaDrawerProps): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--ha-scrim)',
          zIndex: 199,
        }}
        aria-label="Close drawer"
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 'var(--ha-masthead-height)',
          bottom: 0,
          width,
          zIndex: 200,
          background: 'var(--ha-surface-raised)',
          borderLeft: '1px solid var(--ha-border)',
          boxShadow: 'var(--ha-shadow-drawer)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 56,
            borderBottom: '1px solid var(--ha-border)',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--ha-text-md)', fontWeight: 600, color: 'var(--ha-text-primary)' }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ha-text-secondary)',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Close drawer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              borderTop: '1px solid var(--ha-border)',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}
      </style>
    </>
  );
}
