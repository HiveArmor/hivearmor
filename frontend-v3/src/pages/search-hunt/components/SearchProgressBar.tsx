/**
 * SearchProgressBar — Real-time search progress indicator.
 *
 * Shows during active search with percentage (shardsCompleted/shardsTotal * 100),
 * elapsed time, estimated remaining time, partial results indicator,
 * and a cancel button.
 */

import { useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { CircleStop, Loader2 } from 'lucide-react';

import type { SearchStreamState } from '../hooks/useSearchStream';
import { cancelSearch } from '../searchHunt.service';

export interface SearchProgressBarProps {
  searchId: string;
  stream: SearchStreamState;
  onCancelled: () => void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function estimateRemaining(
  shardsCompleted: number,
  shardsTotal: number,
  elapsedMs: number,
): string | null {
  if (shardsCompleted <= 0 || shardsTotal <= 0) return null;
  const rate = shardsCompleted / elapsedMs;
  const remaining = (shardsTotal - shardsCompleted) / rate;
  if (remaining <= 0) return null;
  return formatElapsed(Math.round(remaining));
}

export function SearchProgressBar({
  searchId,
  stream,
  onCancelled,
}: SearchProgressBarProps): JSX.Element {
  const startTimeRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  const cancelMutation = useMutation({
    mutationFn: () => cancelSearch(searchId),
    onSuccess: () => onCancelled(),
  });

  // Track elapsed time
  useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 250);
    return () => clearInterval(interval);
  }, [searchId]);

  const percentage = stream.shardsTotal > 0
    ? Math.round((stream.shardsCompleted / stream.shardsTotal) * 100)
    : 0;

  const remaining = estimateRemaining(
    stream.shardsCompleted,
    stream.shardsTotal,
    elapsed,
  );

  const isCancelled = stream.cancelled || cancelMutation.isSuccess;

  return (
    <div
      className="hunt-progress-bar"
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={isCancelled ? 'Search cancelled' : `Search progress: ${percentage}%`}
    >
      <div className="hunt-progress-bar__track">
        <div
          className="hunt-progress-bar__fill"
          data-cancelled={isCancelled || undefined}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
      <div className="hunt-progress-bar__info">
        <span className="hunt-progress-bar__status">
          {isCancelled ? (
            <><CircleStop size={12} />Cancelled</>
          ) : (
            <><Loader2 size={12} className="hunt-progress-bar__spinner" />Searching… {percentage}%</>
          )}
        </span>
        <span className="hunt-progress-bar__timing">
          <span>Elapsed: {formatElapsed(elapsed)}</span>
          {remaining && !isCancelled && <span>Est. remaining: {remaining}</span>}
          {stream.shardsTotal > 0 && (
            <span>{stream.shardsCompleted}/{stream.shardsTotal} shards</span>
          )}
        </span>
        {!isCancelled && (
          <button
            type="button"
            className="hunt-button hunt-button--stop hunt-progress-bar__cancel"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            <CircleStop size={12} />
            {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
      {stream.partialMessage && !isCancelled && (
        <div className="hunt-progress-bar__partial" aria-live="polite">
          {stream.partialMessage}
        </div>
      )}
    </div>
  );
}
