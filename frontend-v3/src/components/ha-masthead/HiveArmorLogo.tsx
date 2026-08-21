/**
 * HiveArmorLogo — Hexagonal hive/honeycomb SVG icon.
 */

import { useId } from 'react';

export interface HiveArmorLogoProps {
  size?: number;
  className?: string;
}

export function HiveArmorLogo({ size = 32, className = '' }: HiveArmorLogoProps): JSX.Element {
  const gradientId = `ha-logo-${useId().replace(/:/g, '')}`;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: 'var(--ha-brand-primary)',
      }}
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="4" y1="28" x2="27" y2="5" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--ha-brand-hot)" />
            <stop offset="1" stopColor="var(--ha-brand-primary)" />
          </linearGradient>
        </defs>
        <path d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z" stroke={`url(#${gradientId})`} strokeWidth="1.5" fill="none" />
        <path d="M16 8 L22 11.5 L22 18.5 L16 22 L10 18.5 L10 11.5 Z" fill="currentColor" opacity="0.6" />
        <circle cx="16" cy="15" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
