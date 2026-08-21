/**
 * SnapshotInfoBar — bar at bottom showing snapshot ID, node/edge count,
 * truncated warning, expiry countdown.
 */

import { useEffect, useState } from 'react';

import type { SnapshotMetadata } from '../types/constellation.types';

interface SnapshotInfoBarProps {
  metadata: SnapshotMetadata | null;
  snapshotId: string | null;
}

function formatCountdown(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function SnapshotInfoBar({ metadata, snapshotId }: SnapshotInfoBarProps): JSX.Element | null {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!metadata?.expiresAt) return;
    setCountdown(formatCountdown(metadata.expiresAt));
    const timer = setInterval(() => {
      setCountdown(formatCountdown(metadata.expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [metadata?.expiresAt]);

  if (!snapshotId || !metadata) {
    return (
      <footer className="ha-snapshot-info" aria-label="Snapshot status">
        <span className="ha-snapshot-info__status">No active snapshot</span>
      </footer>
    );
  }

  return (
    <footer className="ha-snapshot-info" aria-label="Snapshot status">
      <span className="ha-snapshot-info__id" title={snapshotId}>
        Snapshot: {snapshotId.slice(0, 12)}…
      </span>
      <span className="ha-snapshot-info__nodes">
        {metadata.totalNodes} nodes
      </span>
      <span className="ha-snapshot-info__edges">
        {metadata.totalEdges} edges
      </span>
      {metadata.truncated && (
        <span className="ha-snapshot-info__truncated" role="status">
          ⚠ Graph truncated — limits reached
        </span>
      )}
      <span className="ha-snapshot-info__expiry">
        Expires: {countdown}
      </span>
      <span className="ha-snapshot-info__hops">
        {metadata.hopsExplored} hop{metadata.hopsExplored !== 1 ? 's' : ''} explored
      </span>
    </footer>
  );
}
