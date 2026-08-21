export interface LoadingStateProps {
  message?: string;
  rows?: number;
  showHeader?: boolean;
  className?: string;
}

export function LoadingState({
  message,
  rows = 5,
  showHeader = true,
  className = '',
}: LoadingStateProps): JSX.Element {
  const widths = ['100%', '80%', '90%', '70%', '85%'];

  return (
    <div
      className={`loading-state ${className}`}
      aria-busy="true"
      style={{
        padding: 'var(--ha-space-4)',
        width: '100%',
      }}
    >
      {message && (
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            marginBottom: 'var(--ha-space-4)',
            textAlign: 'center',
          }}
        >
          {message}
        </div>
      )}
      {showHeader && (
        <div
          className="ha-skeleton"
          style={{
            height: '20px',
            borderRadius: 'var(--ha-radius-base)',
            width: '60%',
            marginBottom: 'var(--ha-space-3)',
            background: 'var(--ha-surface-raised)',
            animation: 'ha-skeleton-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="ha-skeleton"
          style={{
            height: '20px',
            borderRadius: 'var(--ha-radius-base)',
            width: widths[index % widths.length],
            marginBottom: 'var(--ha-space-3)',
            background: 'var(--ha-surface-raised)',
            animation: 'ha-skeleton-pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}
