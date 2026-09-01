import type React from 'react';

import './HaBadge.css';

export interface HaBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onClick'> {
  /** Optional leading node (icon or status dot). */
  icon?: React.ReactNode;
  /** Pill shape (fully-round) vs the default rounded rectangle. */
  pill?: boolean;
  /** Small (default) or medium density. */
  size?: 'sm' | 'md';
  /** Use the monospace font — for machine identifiers (IP/host/hash). */
  mono?: boolean;
  /** Muted foreground (secondary) instead of primary. */
  muted?: boolean;
  /** When provided, the badge is an interactive button. */
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * HaBadge — the bordered inline pill extracted from EntityBadge + TenantBadge (rule of three;
 * both hand-rolled the same inline-flex + surface + border + radius + padding pill, with
 * stale-alias tokens). Consumers keep their domain logic (risk dot, entity icon, truncation)
 * and pass it as `icon` / `children`.
 *
 * Tokens only. `mono` for identifier values, `pill` for the fully-round shape (TenantBadge).
 */
export function HaBadge({
  icon,
  pill,
  size = 'sm',
  mono,
  muted,
  onClick,
  className,
  children,
  ...rest
}: HaBadgeProps): JSX.Element {
  const interactive = Boolean(onClick);
  return (
    <span
      className={[
        'ha-badge',
        `ha-badge--${size}`,
        pill ? 'ha-badge--pill' : '',
        mono ? 'ha-badge--mono' : '',
        muted ? 'ha-badge--muted' : '',
        interactive ? 'ha-badge--interactive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      {...rest}
    >
      {icon}
      <span className="ha-badge__label">{children}</span>
    </span>
  );
}
