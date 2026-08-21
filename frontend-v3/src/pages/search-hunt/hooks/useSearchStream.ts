/**
 * useSearchStream — SSE hook for real-time search progress updates.
 *
 * Connects to /api/ha-hunts/search/{searchId}/stream via fetch + ReadableStream
 * (using Authorization header instead of URL query params for security).
 * Dispatches received events to update progress bar state and partial result indicators.
 * Closes connection when search completes or is cancelled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  SearchCompletedEvent,
  SearchPartialEvent,
  SearchProgressEvent,
} from '../searchHunt.types';

export interface SearchStreamState {
  /** Whether the SSE connection is active */
  connected: boolean;
  /** Shards completed so far */
  shardsCompleted: number;
  /** Total shards to search */
  shardsTotal: number;
  /** Number of hits found so far */
  hitsFound: number;
  /** Whether search completed (via SSE event) */
  completed: boolean;
  /** Whether search was cancelled */
  cancelled: boolean;
  /** Error message if the search failed */
  error: string | null;
  /** Total hits on completion */
  totalHits: number | null;
  /** Duration in ms on completion */
  duration: number | null;
  /** Partial result message (e.g., "Found 42 events so far...") */
  partialMessage: string | null;
}

const INITIAL_STATE: SearchStreamState = {
  connected: false,
  shardsCompleted: 0,
  shardsTotal: 0,
  hitsFound: 0,
  completed: false,
  cancelled: false,
  error: null,
  totalHits: null,
  duration: null,
  partialMessage: null,
};

export function useSearchStream(
  searchId: string | null,
  status: 'running' | 'completed' | 'cancelled' | 'idle',
): SearchStreamState {
  const [state, setState] = useState<SearchStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const disconnect = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    // Only connect when we have a searchId and status is "running"
    if (!searchId || status !== 'running') {
      disconnect();
      if (!searchId) setState(INITIAL_STATE);
      return;
    }

    // Reset state for new search
    setState({
      ...INITIAL_STATE,
      connected: true,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    const connect = async (): Promise<void> => {
      try {
        const token = localStorage.getItem('hivearmor_auth_token') ?? '';
        const url = `/api/ha-hunts/search/${encodeURIComponent(searchId)}/stream`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            connected: false,
            error: `Stream connection failed: ${response.status}`,
          }));
          return;
        }

        setState((prev) => ({ ...prev, connected: true }));

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          setState((prev) => ({ ...prev, connected: false, error: 'Response body is null' }));
          return;
        }

        let buffer = '';
        let currentEventType = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              const rawData = line.substring(6);
              try {
                handleEvent(currentEventType, rawData, setState);
              } catch {
                // ignore malformed events
              }
              currentEventType = '';
            } else if (line === '') {
              // Empty line marks end of event block — reset event type
              currentEventType = '';
            }
          }
        }

        // Stream ended naturally (server closed)
        setState((prev) => ({ ...prev, connected: false }));
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          connected: false,
          error: (error as Error).message ?? 'Connection lost',
        }));
      }
    };

    connect();

    return () => {
      disconnect();
    };
  }, [searchId, status, disconnect]);

  // Close connection when search completes or is cancelled externally
  useEffect(() => {
    if (status === 'completed' || status === 'cancelled') {
      disconnect();
      if (status === 'cancelled') {
        setState((prev) => ({ ...prev, connected: false, cancelled: true }));
      }
    }
  }, [status, disconnect]);

  return state;
}

function handleEvent(
  eventType: string,
  rawData: string,
  setState: React.Dispatch<React.SetStateAction<SearchStreamState>>,
): void {
  switch (eventType) {
    case 'search.progress': {
      const data = JSON.parse(rawData) as SearchProgressEvent;
      setState((prev) => ({
        ...prev,
        shardsCompleted: data.shardsCompleted,
        shardsTotal: data.shardsTotal,
        hitsFound: data.hitsFound,
      }));
      break;
    }
    case 'search.partial': {
      const data = JSON.parse(rawData) as SearchPartialEvent;
      setState((prev) => ({
        ...prev,
        hitsFound: prev.hitsFound + data.newHits,
        partialMessage: `Found ${prev.hitsFound + data.newHits} events so far...`,
      }));
      break;
    }
    case 'search.completed': {
      const data = JSON.parse(rawData) as SearchCompletedEvent;
      setState((prev) => ({
        ...prev,
        connected: false,
        completed: true,
        totalHits: data.totalHits,
        duration: data.duration,
        shardsCompleted: data.diagnostics.shardsSearched,
        shardsTotal: data.diagnostics.shardsSearched,
      }));
      break;
    }
    case 'search.failed': {
      const data = JSON.parse(rawData) as { error?: string };
      setState((prev) => ({
        ...prev,
        connected: false,
        error: data.error ?? 'Search failed',
      }));
      break;
    }
    default:
      // Ignore keepalive or unknown events
      break;
  }
}
