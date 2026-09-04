/**
 * useDetectionStream — SSE hook for detection health updates (Sprint 47 DET-013)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchEventSource, type FetchEventSourceHandle } from '@/lib/fetchEventSource';
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

  const eventSourceRef = useRef<FetchEventSourceHandle | null>(null);
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

    // B0-5c: token in the Authorization header (fetch-based SSE), never the URL query string.
    const stream = fetchEventSource(DETECTION_STREAM_URL, {
      token,
      onOpen: () => { setConnected(true); setError(null); },
      onError: () => { setConnected(false); setError('Connection lost, reconnecting…'); },
      onMessage: (message) => {
        try {
          const parsed = JSON.parse(message.data) as DetectionSseEvent;
          if (eventTypesRef.current && !eventTypesRef.current.includes(parsed.type)) {
            return;
          }
          setLastEvent(parsed);
          if (message.id) setLastEventId(message.id);
          onEventRef.current?.(parsed);
        } catch {
          // Ignore malformed events (e.g., keepalive pings)
        }
      },
    });
    eventSourceRef.current = stream;
  }, []);

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
