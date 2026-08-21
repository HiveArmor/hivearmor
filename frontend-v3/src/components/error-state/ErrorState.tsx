import { AlertTriangle } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  error?: Error;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An error occurred. Please try again.',
  onRetry,
  error,
  className = '',
}: ErrorStateProps): JSX.Element {
  const isDev = import.meta.env.DEV;

  return (
    <div
      role="alert"
      className={`error-state ${className}`}
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
        className="error-state-icon"
        style={{
          color: 'var(--ha-critical)',
          marginBottom: 'var(--ha-space-4)',
        }}
      >
        <AlertTriangle size={48} />
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
          marginBottom: onRetry ? 'var(--ha-space-6)' : 0,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '8px 16px',
            fontSize: 'var(--ha-text-sm)',
            fontWeight: 'var(--ha-weight-medium)',
            borderRadius: 'var(--ha-radius-base)',
            border: '1px solid var(--ha-border)',
            background: 'var(--ha-surface-raised)',
            color: 'var(--ha-text-primary)',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ha-surface-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--ha-surface-raised)';
          }}
        >
          Try again
        </button>
      )}
      {isDev && error && (
        <pre
          style={{
            marginTop: 'var(--ha-space-6)',
            padding: 'var(--ha-space-4)',
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-secondary)',
            fontSize: 'var(--ha-text-xs)',
            fontFamily: 'var(--ha-font-mono)',
            maxWidth: '600px',
            overflow: 'auto',
            textAlign: 'left',
          }}
        >
          {error.stack || error.message}
        </pre>
      )}
    </div>
  );
}
