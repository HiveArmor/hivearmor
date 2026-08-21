/**
 * useDetectionStream — SSE hook for detection health updates (Sprint 47 DET-013)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DETECTION_STREAM_URL } from '@/pages/detection-rules/services/detection.service';
import type { DetectionSseEvent, DetectionSseEventType } from '@/pages/detection-rules/types/detection.types';

interface UseDetectionStreamOptions {
  enabled?: boolean;
  onEvent?: (event: DetectionSseEvent) => void;
  eventTypes?: DetectionSseEventType[];
}

interface UseDetectionStreamResult {
  connected: boolean;
  lastEvent: DetectionSseEvent | null;
  lastEventId: string | null;
  error: string | null;
  reconnect: () => void;
}

const TOKEN_KEY = 'hivearmor_auth_token';

export function useDetectionStream(options: UseDetectionStreamOptions = {}): UseDetectionStreamResult {
  const { enabled = true, onEvent, eventTypes } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DetectionSseEvent | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const eventTypesRef = useRef(eventTypes);

  // Keep refs in sync without triggering reconnects
  onEventRef.current = onEvent;
  eventTypesRef.current = eventTypes;

  const connect = useCallback(() => {
    // Close existing connection
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError('No authentication token');
      return;
    }

    // Build SSE URL with auth token as query param (SSE does not support headers)
    const url = new URL(DETECTION_STREAM_URL, window.location.origin);
    url.searchParams.set('token', token);
    if (lastEventId) {
      url.searchParams.set('Last-Event-ID', lastEventId);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data as string) as DetectionSseEvent;

        // Filter by event type if specified
        if (eventTypesRef.current && !eventTypesRef.current.includes(parsed.type)) {
          return;
        }

        setLastEvent(parsed);
        if (event.lastEventId) {
          setLastEventId(event.lastEventId);
        }
        onEventRef.current?.(parsed);
      } catch {
        // Ignore malformed events (e.g., keepalive pings)
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError('Connection lost, reconnecting…');
      // EventSource auto-reconnects; if it gives up, we manually retry
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSourceRef.current = null;
        // Retry after 5 seconds
        window.setTimeout(() => {
          if (enabled) connect();
        }, 5000);
      }
    };
  }, [enabled, lastEventId]);

  useEffect(() => {
    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setConnected(false);
      return;
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [enabled, connect]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  return { connected, lastEvent, lastEventId, error, reconnect };
}
