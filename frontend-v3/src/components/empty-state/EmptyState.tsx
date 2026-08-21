import type React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={`empty-state ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
        padding: 'var(--ha-space-6)',
      }}
    >
      {icon && (
        <div
          className="empty-state-icon"
          style={{
            color: 'var(--ha-text-secondary)',
            opacity: 0.4,
            marginBottom: 'var(--ha-space-4)',
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: 'var(--ha-text-xl)',
          fontWeight: 'var(--ha-weight-semibold)',
          color: 'var(--ha-text-primary)',
          marginBottom: 'var(--ha-space-2)',
          textAlign: 'center',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            maxWidth: '400px',
            textAlign: 'center',
            marginBottom: action ? 'var(--ha-space-6)' : 0,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
