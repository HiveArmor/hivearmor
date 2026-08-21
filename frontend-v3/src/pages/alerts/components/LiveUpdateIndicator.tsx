/**
 * LiveUpdateIndicator — SSE connection status badge for the investigation page header.
 * Displays a colored dot and label indicating EventSource connection state.
 */

import type { StreamConnectionStatus } from '../hooks/useInvestigationStream';

import './LiveUpdateIndicator.css';

interface LiveUpdateIndicatorProps {
  status: StreamConnectionStatus;
}

const statusLabels: Record<StreamConnectionStatus, string> = {
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline',
};

export function LiveUpdateIndicator({ status }: LiveUpdateIndicatorProps): JSX.Element {
  return (
    <span
      className="ha-live-update-indicator"
      data-status={status}
      role="status"
      aria-label={`Live update connection: ${statusLabels[status]}`}
    >
      <span className="ha-live-update-indicator__dot" aria-hidden="true" />
      <span className="ha-live-update-indicator__label">{statusLabels[status]}</span>
    </span>
  );
}
