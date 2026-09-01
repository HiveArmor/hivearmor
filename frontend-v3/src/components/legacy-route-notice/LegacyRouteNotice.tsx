import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { LegacyRouteEntry } from '@/lib/deprecation.honesty';

import './LegacyRouteNotice.css';

export interface LegacyRouteNoticeProps {
  entry: LegacyRouteEntry;
}

export function LegacyRouteNotice({ entry }: LegacyRouteNoticeProps): JSX.Element {
  return (
    <div
      className="ha-legacy-route-notice"
      role="status"
      data-testid="legacy-route-notice"
      data-legacy-path={entry.path}
    >
      <AlertTriangle size={16} className="ha-legacy-route-notice__icon" aria-hidden="true" />
      <div className="ha-legacy-route-notice__copy">
        <strong>{entry.bannerTitle}</strong>
        <span>{entry.bannerDetail}</span>
        <Link className="ha-legacy-route-notice__canonical" to={entry.canonicalPath}>
          Open canonical path: {entry.canonicalPath}
        </Link>
      </div>
    </div>
  );
}
