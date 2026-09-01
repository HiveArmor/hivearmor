/**
 * StatusDock — 28px fixed bottom bar
 * Required on all Operational Queue pages
 */

import { useMemo } from 'react';
import './StatusDock.css';

export interface StatusDockProps {
  sseConnected: boolean;
  eps: number;
  mode?: 'live' | 'historical';
  lastUpdated?: Date;
  className?: string;
}

export function StatusDock({
  sseConnected,
  eps,
  mode,
  lastUpdated,
  className = '',
}: StatusDockProps): JSX.Element {
  const connectionStatus = useMemo(() => {
    if (sseConnected) return { label: 'Connected', color: 'var(--ha-positive)' };
    return { label: 'Disconnected', color: 'var(--ha-critical)' };
  }, [sseConnected]);

  const staleDuration = useMemo(() => {
    if (!lastUpdated) return null;
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin > 15) {
      return `Last updated ${diffMin}m ago`;
    }
    return null;
  }, [lastUpdated]);

  const statusSummary = useMemo(() => {
    const parts = [connectionStatus.label];
    if (mode === 'live') {
      parts.push('Live mode');
    } else if (mode === 'historical') {
      parts.push('Historical mode');
    }
    parts.push(`${eps} events per second`);
    if (staleDuration) {
      parts.push(staleDuration);
    }
    return parts.join(', ');
  }, [connectionStatus.label, eps, mode, staleDuration]);

  return (
    <div
      className={`status-dock ${className}`}
      role="status"
      aria-label={statusSummary}
    >
      <div className="status-dock__left">
        <div
          className="status-dock__indicator"
          style={{ backgroundColor: connectionStatus.color }}
          aria-hidden="true"
        />
        <span className="status-dock__connection-text">{connectionStatus.label}</span>
        {mode === 'live' && (
          <>
            <span className="status-dock__separator" aria-hidden="true">•</span>
            <div className="status-dock__live-indicator" aria-hidden="true" />
            <span className="status-dock__mode-text status-dock__mode-text--live">Live</span>
          </>
        )}
        {mode === 'historical' && (
          <>
            <span className="status-dock__separator" aria-hidden="true">•</span>
            <span className="status-dock__mode-text">■ Historical</span>
          </>
        )}
      </div>
      <div className="status-dock__right">
        <span className="status-dock__eps">{eps} eps</span>
        {staleDuration && <span className="status-dock__stale-warning">{staleDuration}</span>}
      </div>
    </div>
  );
}
