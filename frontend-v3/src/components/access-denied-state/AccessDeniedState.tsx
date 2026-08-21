/**
 * AccessDeniedState — Reusable access denied display component
 */

import { ShieldX } from 'lucide-react';

export interface AccessDeniedStateProps {
  title?: string;
  message?: string;
  className?: string;
}

export function AccessDeniedState({
  title = 'Access Restricted',
  message = 'You do not have permission to view this resource.',
  className = '',
}: AccessDeniedStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className={`access-denied-state ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
        padding: 'var(--ha-space-6)',
      }}
    >
      <div
        className="access-denied-icon"
        style={{
          color: 'var(--ha-critical)',
          marginBottom: 'var(--ha-space-4)',
        }}
      >
        <ShieldX size={48} />
      </div>
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
      <p
        style={{
          fontSize: 'var(--ha-text-sm)',
          color: 'var(--ha-text-secondary)',
          maxWidth: '400px',
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
    </div>
  );
}
