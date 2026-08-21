import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface HaInlineBannerProps {
  variant: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  description: string;
  isDismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function HaInlineBanner({
  variant,
  title,
  description,
  isDismissible = true,
  onDismiss,
  className = '',
}: HaInlineBannerProps): JSX.Element {
  const variantStyles = {
    info: {
      bg: 'var(--ha-fill-medium-subtle)',
      border: 'var(--ha-medium)',
      icon: Info,
      iconColor: 'var(--ha-medium)',
    },
    warning: {
      bg: 'var(--ha-fill-high-subtle)',
      border: 'var(--ha-high)',
      icon: AlertTriangle,
      iconColor: 'var(--ha-high)',
    },
    danger: {
      bg: 'var(--ha-fill-critical-subtle)',
      border: 'var(--ha-critical)',
      icon: AlertCircle,
      iconColor: 'var(--ha-critical)',
    },
    success: {
      bg: 'var(--ha-fill-low-subtle)',
      border: 'var(--ha-positive)',
      icon: CheckCircle2,
      iconColor: 'var(--ha-positive)',
    },
  };

  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div
      role="alert"
      className={`ha-inline-banner ${className}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--ha-radius-base, 4px)',
        marginBottom: '16px',
      }}
    >
      <Icon
        size={20}
        style={{
          color: style.iconColor,
          flexShrink: 0,
          marginTop: '2px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div
            style={{
              fontSize: 'var(--ha-text-sm)',
              fontWeight: 600,
              color: 'var(--ha-text-primary)',
              marginBottom: title && description ? '4px' : 0,
            }}
          >
            {title}
          </div>
        )}
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      </div>
      {isDismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: 'var(--ha-text-secondary)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
