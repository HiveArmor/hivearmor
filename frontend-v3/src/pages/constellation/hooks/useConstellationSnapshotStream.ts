import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/store/auth.store';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const reconnectDelayMs = 5_000;

interface SnapshotStreamState {
  connected: boolean;
  pendingChanges: number;
  expired: boolean;
  clearPendingChanges: () => void;
}

interface ParsedSseEvent {
  id?: string;
  event?: string;
  data?: string;
}

function parseEventBlock(block: string): ParsedSseEvent {
  const parsed: ParsedSseEvent = {};
  const data: string[] = [];
  block.split('\n').forEach((line) => {
    if (line.startsWith('id:')) parsed.id = line.slice(3).trim();
    else if (line.startsWith('event:')) parsed.event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });
  if (data.length) parsed.data = data.join('\n');
  return parsed;
}

export function useConstellationSnapshotStream(snapshotId?: string | null): SnapshotStreamState {
  const token = useAuthStore((state) => state.token);
  const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
  const [connected, setConnected] = useState(fixtureMode);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [expired, setExpired] = useState(false);
  const lastEventIdRef = useRef<string>();
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearPendingChanges = useCallback(() => setPendingChanges(0), []);

  useEffect(() => {
    setPendingChanges(0);
    setExpired(false);
    lastEventIdRef.current = undefined;

    if (fixtureMode) {
      setConnected(Boolean(snapshotId));
      return () => setConnected(false);
    }
    if (!snapshotId || !token) {
      setConnected(false);
      return undefined;
    }

    let disposed = false;
    let snapshotExpired = false;
    let terminalFailure = false;
    let controller: AbortController | null = null;

    const connect = async (): Promise<void> => {
      if (disposed) return;
      controller = new AbortController();
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        };
        if (selectedTenantId !== null) headers['X-Tenant-ID'] = String(selectedTenantId);
        if (lastEventIdRef.current) headers['Last-Event-ID'] = lastEventIdRef.current;
        const response = await fetch(
          `/api/ha-constellation/stream?snapshot=${encodeURIComponent(snapshotId)}`,
          { headers, signal: controller.signal }
        );
        if (response.status === 404) {
          snapshotExpired = true;
          setExpired(true);
          setConnected(false);
          return;
        }
        if (response.status === 401 || response.status === 403) {
          terminalFailure = true;
          setConnected(false);
          return;
        }
        if (!response.ok || !response.body) throw new Error(`Snapshot stream failed: ${response.status}`);
        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!disposed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          blocks.forEach((block) => {
            const event = parseEventBlock(block);
            if (event.id) lastEventIdRef.current = event.id;
            if (!event.data) return;
            if (event.event === 'snapshot.expired') {
              snapshotExpired = true;
              setExpired(true);
              setConnected(false);
              return;
            }
            if (event.event && event.event !== 'heartbeat') {
              setPendingChanges((current) => current + 1);
            }
          });
        }
      } catch (error) {
        if (disposed || (error as Error).name === 'AbortError') return;
        setConnected(false);
      }
      if (!disposed && !snapshotExpired && !terminalFailure) {
        reconnectTimerRef.current = setTimeout(() => void connect(), reconnectDelayMs);
      }
    };

    void connect();
    return () => {
      disposed = true;
      controller?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      setConnected(false);
    };
  }, [selectedTenantId, snapshotId, token]);

  return { connected, pendingChanges, expired, clearPendingChanges };
}
