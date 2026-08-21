/**
 * ActivatedBadge — User activation status badge
 * ADM-01 §8.3
 */

export interface ActivatedBadgeProps {
  activated: boolean;
}

export function ActivatedBadge({ activated }: ActivatedBadgeProps): JSX.Element {
  const style = activated
    ? {
        label: 'Active',
        bg: 'var(--ha-fill-low-muted)',
        text: 'var(--ha-positive)',
      }
    : {
        label: 'Inactive',
        bg: 'var(--ha-fill-critical-subtle)',
        text: 'var(--ha-critical)',
      };

  return (
    <span
      aria-label={`Status: ${style.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--ha-radius-sm)',
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {style.label}
    </span>
  );
}
