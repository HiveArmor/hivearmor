/**
 * LiveEpsBadge — Shows live events per second (EPS) from SSE stream
 * Uses useEpsStream hook
 */

import { useEpsStream } from '@/hooks/useEpsStream';

export function LiveEpsBadge(): JSX.Element {
  const { eps, connected } = useEpsStream();

  return (
    <div
      className="ha-live-eps"
      data-connected={connected}
      role="status"
      title={connected ? 'Live events per second' : 'Reconnecting...'}
    >
      <span className="ha-live-eps__dot" aria-hidden="true" />
      <span>{eps.toLocaleString()} EPS</span>
    </div>
  );
}
