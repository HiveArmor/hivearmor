/**
 * HiveArmorLogo — brand mark for masthead and compact identity slots.
 */

import { HaBrandLockup } from '@/components/ha-brand-lockup';

export interface HiveArmorLogoProps {
  size?: number;
  className?: string;
}

export function HiveArmorLogo({ size = 32, className = '' }: HiveArmorLogoProps): JSX.Element {
  return <HaBrandLockup variant="mark" size={size} className={className} decorative />;
}
