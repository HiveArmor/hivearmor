/**
 * HaWordmark
 * HiveArmor logotype for compact auth identity slots.
 */

import { HaBrandLockup } from '@/components/ha-brand-lockup';

import './HaWordmark.css';

export function HaWordmark(): JSX.Element {
  return (
    <div className="ha-wordmark">
      <HaBrandLockup variant="mark" size={36} decorative />
      <span className="ha-wordmark__name">HiveArmor</span>
    </div>
  );
}
