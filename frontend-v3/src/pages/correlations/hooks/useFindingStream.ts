/**
 * Sprint 44 — Finding Stream Hook.
 * EventSource connecting to /api/ha-correlated-findings/stream.
 * Auto-invalidates queue query on incoming events.
 */

import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/store/auth.store';

const SSE_URL = '/api/ha-correlated-findings/stream';

/**
 * Connects to the correlated findings SSE stream and invalidates
 * the TanStack Query cache keys when events arrive.
 */
export function useFindingStream(): void {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const connect = (): void => {
      // EventSource doesn't support custom headers, so token is sent via the
      // 'token' query param — handled by PlaybookSseTokenFilter on the backend.
      const url = `${SSE_URL}?token=${encodeURIComponent(token)}`;
      const source = new EventSource(url);
      eventSourceRef.current = source;

      source.onmessage = () => {
        // Invalidate the correlated findings queue so it refetches
        void queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
      };

      source.addEventListener('finding.created', () => {
        void queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
      });

      source.addEventListener('finding.updated', (event) => {
        void queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
        // Also invalidate the specific finding detail if we have the ID
        try {
          const data = JSON.parse((event as MessageEvent).data) as { data?: { id?: string } };
          if (data.data?.id) {
            void queryClient.invalidateQueries({ queryKey: ['finding', data.data.id] });
          }
        } catch {
          // ignore parse errors
        }
      });

      source.addEventListener('finding.escalated', () => {
        void queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
      });

      source.addEventListener('finding.stage_added', (event) => {
        void queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
        try {
          const data = JSON.parse((event as MessageEvent).data) as { data?: { id?: string } };
          if (data.data?.id) {
            void queryClient.invalidateQueries({ queryKey: ['finding', data.data.id] });
          }
        } catch {
          // ignore parse errors
        }
      });

      source.addEventListener('finding.signal_added', (event) => {
        void queryClient.invalidateQueries({ queryKey: ['correlated-findings'] });
        try {
          const data = JSON.parse((event as MessageEvent).data) as { data?: { id?: string } };
          if (data.data?.id) {
            void queryClient.invalidateQueries({ queryKey: ['finding-signals', data.data.id] });
          }
        } catch {
          // ignore parse errors
        }
      });

      source.onerror = () => {
        source.close();
        eventSourceRef.current = null;
        // Reconnect after 5 seconds
        reconnectTimerRef.current = setTimeout(connect, 5_000);
      };
    };

    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isAuthenticated, token, queryClient]);
}
