/**
 * EntityTimelineRoutePage — standalone deep-link for `/ueba/entity-timeline?userId=…`.
 *
 * Registers the existing EntityTimelinePage on the router so the
 * `UEBA_ENTITY_TIMELINE` constant is not an orphan. Missing `userId` redirects
 * to the risk dashboard (primary UEBA entry).
 *
 * Access is gated by AuthGuard (Analyst | SOC Manager | Platform Administrator).
 */

import { Navigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/constants/routes.constants';
import { EntityTimelinePage } from '@/pages/ueba/entity-timeline/EntityTimelinePage';

export function EntityTimelineRoutePage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId')?.trim() ?? '';

  if (!userId) {
    return <Navigate to={ROUTES.UEBA_RISK} replace />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--ha-space-3)',
        padding: 'var(--ha-space-3)',
        minHeight: 0,
        height: '100%',
      }}
    >
      <header>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--ha-font-ui)',
            fontSize: 'var(--ha-text-md)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
          }}
        >
          Entity Timeline
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontFamily: 'var(--ha-font-ui)',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          Behavioral deviations for user{' '}
          <span style={{ fontFamily: 'var(--ha-font-mono)' }}>{userId}</span>
        </p>
      </header>

      <EntityTimelinePage userId={userId} />
    </div>
  );
}
