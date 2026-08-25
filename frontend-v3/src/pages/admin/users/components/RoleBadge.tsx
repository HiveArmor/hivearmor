/**
 * RoleBadge — Role display badge for user grid
 * ADM-01 §8.2
 */

import { formatAuthorityLabel } from '@/lib/roles';

export interface RoleBadgeProps {
  role: string;
}

const ROLE_STYLES: Record<string, { bg: string; text: string }> = {
  ROLE_ADMIN: {
    bg: 'var(--ha-fill-intelligence-muted)',
    text: 'var(--ha-intelligence)',
  },
  ROLE_SOC_MANAGER: {
    bg: 'var(--ha-fill-primary-muted)',
    text: 'var(--ha-primary)',
  },
  ROLE_ANALYST: {
    bg: 'var(--ha-fill-medium-muted)',
    text: 'var(--ha-medium)',
  },
  ROLE_USER: {
    bg: 'var(--ha-fill-high-muted)',
    text: 'var(--ha-high)',
  },
  ROLE_READ_ONLY: {
    bg: 'transparent',
    text: 'var(--ha-text-secondary)',
  },
  ROLE_PRE_VERIFICATION_USER: {
    bg: 'var(--ha-fill-critical-subtle)',
    text: 'var(--ha-critical)',
  },
};

export function RoleBadge({ role }: RoleBadgeProps): JSX.Element {
  const style = ROLE_STYLES[role] || {
    bg: 'transparent',
    text: 'var(--ha-text-secondary)',
  };
  const label = formatAuthorityLabel(role);

  return (
    <span
      aria-label={`Role: ${label}`}
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
      {label}
    </span>
  );
}
