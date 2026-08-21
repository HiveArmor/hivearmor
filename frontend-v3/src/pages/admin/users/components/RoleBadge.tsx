/**
 * RoleBadge — Role display badge for user grid
 * ADM-01 §8.2
 */

export interface RoleBadgeProps {
  role: string;
}

const ROLE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  ROLE_ADMIN: {
    label: 'Admin',
    bg: 'var(--ha-fill-intelligence-muted)',
    text: 'var(--ha-intelligence)',
  },
  ROLE_SOC_MANAGER: {
    label: 'SOC Manager',
    bg: 'var(--ha-fill-primary-muted)',
    text: 'var(--ha-primary)',
  },
  ROLE_ANALYST: {
    label: 'Analyst',
    bg: 'var(--ha-fill-medium-muted)',
    text: 'var(--ha-medium)',
  },
  ROLE_USER: {
    label: 'Security Op.',
    bg: 'var(--ha-fill-high-muted)',
    text: 'var(--ha-high)',
  },
  ROLE_READ_ONLY: {
    label: 'Read Only',
    bg: 'transparent',
    text: 'var(--ha-text-secondary)',
  },
  ROLE_PRE_VERIFICATION_USER: {
    label: 'Pending',
    bg: 'var(--ha-fill-critical-subtle)',
    text: 'var(--ha-critical)',
  },
};

export function RoleBadge({ role }: RoleBadgeProps): JSX.Element {
  const style = ROLE_STYLES[role] || {
    label: role,
    bg: 'transparent',
    text: 'var(--ha-text-secondary)',
  };

  return (
    <span
      aria-label={`Role: ${style.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--ha-radius-sm)',
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text,
        border: style.bg === 'transparent' ? '1px solid var(--ha-border)' : 'none',
      }}
    >
      {style.label}
    </span>
  );
}
