/**
 * HaBrandLockup — HiveArmor mark and wordmark lockup for auth / identity surfaces.
 *
 * Served from `/brand/*` in `public/` so logos are not broken by missing hashed
 * Vite assets after partial deploys. Source of truth also lives under src/assets/brand.
 */

import './HaBrandLockup.css';

export type HaBrandLockupVariant = 'mark' | 'lockup';

export interface HaBrandLockupProps {
  variant?: HaBrandLockupVariant;
  /** Pixel height for mark; lockup scales by width. */
  size?: number;
  className?: string;
  /** Decorative only when paired with visible “HiveArmor” text nearby. */
  decorative?: boolean;
}

const MARK_SRC = '/brand/hivearmor-mark.png';
const LOCKUP_SRC = '/brand/hivearmor-lockup.png';

export function HaBrandLockup({
  variant = 'mark',
  size = 32,
  className = '',
  decorative = false,
}: HaBrandLockupProps): JSX.Element {
  const classes = ['ha-brand-lockup', `ha-brand-lockup--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  if (variant === 'lockup') {
    return (
      <img
        className={classes}
        src={LOCKUP_SRC}
        alt={decorative ? '' : 'HiveArmor'}
        aria-hidden={decorative || undefined}
        style={{ height: size, width: 'auto' }}
        draggable={false}
      />
    );
  }

  return (
    <img
      className={classes}
      src={MARK_SRC}
      alt={decorative ? '' : 'HiveArmor'}
      aria-hidden={decorative || undefined}
      style={{ width: size, height: size, objectFit: 'contain' }}
      draggable={false}
    />
  );
}
