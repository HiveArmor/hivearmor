/**
 * EPS Stream Hook
 * Connects to SSE endpoint for live events-per-second updates using fetch + ReadableStream.
 * Uses Authorization header instead of URL query param for security.
 */

import { useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/store/auth.store';

const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export interface EpsData {
  eps: number; // events per second
  timestamp: string;
}

export function useEpsStream(): {
  eps: number;
  connected: boolean;
} {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [eps, setEps] = useState(visualFixtureMode ? 12840 : 0);
  const [connected, setConnected] = useState(visualFixtureMode);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visualFixtureMode) {
      setEps(12840);
      setConnected(true);
      return () => setConnected(false);
    }

    if (!isAuthenticated || !token) {
      setConnected(false);
      return;
    }

    const connect = async (): Promise<void> => {
      try {
        abortControllerRef.current = new AbortController();
        const url = '/api/eps/stream';

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: abortControllerRef.current.signal,
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

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: EpsData = JSON.parse(line.substring(6));
                setEps(data.eps);
              } catch {
                // ignore malformed events
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        setConnected(false);
        reconnectTimerRef.current = setTimeout(connect, 5_000);
      }
    };

    connect();

    return () => {
      abortControllerRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setConnected(false);
    };
  }, [isAuthenticated, token]);

  return { eps, connected };
}
