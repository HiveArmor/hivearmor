export interface ConfidenceIndicatorProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceIndicator({
  score,
  showLabel = true,
  size = 'md',
}: ConfidenceIndicatorProps): JSX.Element {
  const width = size === 'sm' ? 80 : 120;
  const clampedScore = Math.max(0, Math.min(100, score));

  const getGradientColor = (percentage: number): string => {
    if (percentage < 33) {
      return 'var(--ha-medium)';
    } else if (percentage < 67) {
      return 'var(--ha-high)';
    } else {
      return 'var(--ha-critical)';
    }
  };

  return (
    <div
      className="confidence-indicator"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <div
        style={{
          width: `${width}px`,
          height: '4px',
          background: 'var(--ha-border)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${clampedScore}%`,
            height: '100%',
            background: getGradientColor(clampedScore),
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            fontFamily: 'var(--ha-font-mono)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          {clampedScore}%
        </span>
      )}
    </div>
  );
}
