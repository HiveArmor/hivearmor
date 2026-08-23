/**
 * HaBrandLockup — HiveArmor mark and wordmark lockup for auth / identity surfaces.
 */

import lockupUrl from '@/assets/brand/hivearmor-lockup.png';
import markUrl from '@/assets/brand/hivearmor-mark.png';

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
        src={lockupUrl}
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
      src={markUrl}
      alt={decorative ? '' : 'HiveArmor'}
      aria-hidden={decorative || undefined}
      style={{ width: size, height: size, objectFit: 'contain' }}
      draggable={false}
    />
  );
}
