import type { LegacyRouteEntry } from '@/lib/deprecation.honesty';

import './LegacyRouteNotice.css';

export interface LegacyRouteLinkChipProps {
  entry: Pick<LegacyRouteEntry, 'chipLabel' | 'bannerTitle' | 'bannerDetail'>;
}

export function LegacyRouteLinkChip({ entry }: LegacyRouteLinkChipProps): JSX.Element {
  return (
    <span
      className="ha-legacy-route-link-chip"
      title={`${entry.bannerTitle}. ${entry.bannerDetail}`}
      data-testid="legacy-route-link-chip"
    >
      {entry.chipLabel}
    </span>
  );
}
