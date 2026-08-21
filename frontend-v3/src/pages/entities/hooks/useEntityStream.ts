/**
 * useEntityStream — EventSource hook for ENT-005 entity SSE stream.
 * Connects to /api/ha-entities/stream and auto-invalidates entity queries
 * on risk_changed and discovered events.
 */

import { useEffect, useRef, useState } from 'react';

import type { EntitySseEvent, EntitySseEventType } from '../types/entity.types';

import { useAuthStore } from '@/store/auth.store';


const SSE_URL = '/api/ha-entities/stream';
const RECONNECT_DELAY_MS = 5_000;

export interface UseEntityStreamResult {
  connected: boolean;
  lastEvent: EntitySseEvent | null;
}

export function useEntityStream(): UseEntityStreamResult {
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<EntitySseEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setConnected(false);
      return;
    }

    const connect = async (): Promise<void> => {
      try {
        abortRef.current = new AbortController();

        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        };

        if (lastEventIdRef.current) {
          headers['Last-Event-ID'] = lastEventIdRef.current;
        }

        const response = await fetch(SSE_URL, {
          headers,
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        setConnected(true);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';
        let currentEventType = '';
        let currentEventId = '';

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
            } else if (line.startsWith('id: ')) {
              currentEventId = line.substring(4).trim();
              lastEventIdRef.current = currentEventId;
            } else if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.substring(6)) as EntitySseEvent;
                const event: EntitySseEvent = {
                  ...parsed,
                  id: currentEventId || parsed.id,
                  type: (currentEventType || parsed.type) as EntitySseEventType,
                };

                setLastEvent(event);

                // Keep the analyst's active cursor page stable. The inventory page
                // exposes an explicit newer-data affordance instead of reordering rows.
              } catch {
                // Ignore malformed event data
              }
              currentEventType = '';
              currentEventId = '';
            }
            // Ignore comment lines (keepalive) starting with ':'
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setConnected(false);
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };

    void connect();

    return () => {
      abortRef.current?.abort();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
      setConnected(false);
    };
  }, [isAuthenticated, token]);

  return { connected, lastEvent };
}
