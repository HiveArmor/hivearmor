/**
 * useInvestigationStream — SSE live update hook for the alert investigation page.
 * Opens an EventSource to the backend SSE endpoint and dispatches TanStack Query
 * cache invalidations/updates when investigation events arrive.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type {
  AlertStoryResponse,
  InvestigationStreamEvent,
  NetworkActivityResponse,
  ResponseJob,
} from '../alertInvestigation.types';

import { fetchEventSource, type FetchEventSourceHandle } from '@/lib/fetchEventSource';


export type StreamConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type PanelPulseTarget =
  | 'investigation'
  | 'story'
  | 'processes'
  | 'network'
  | 'indicators'
  | 'response';

export interface InvestigationStreamResult {
  status: StreamConnectionStatus;
  /** The most recently pulsed panel, or null. Resets after the animation duration. */
  panelPulse: PanelPulseTarget | null;
}

const AUTH_TOKEN_KEY = 'hivearmor_auth_token';
const PULSE_DURATION_MS = 600;

/**
 * Custom hook that manages an SSE EventSource connection to the investigation
 * stream endpoint, handling reconnection states and dispatching query cache
 * invalidations/optimistic updates.
 */
export function useInvestigationStream(alertId: string | undefined): InvestigationStreamResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamConnectionStatus>('disconnected');
  const [panelPulse, setPanelPulse] = useState<PanelPulseTarget | null>(null);
  const streamRef = useRef<FetchEventSourceHandle | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPulse = useCallback((target: PanelPulseTarget) => {
    setPanelPulse(target);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setPanelPulse(null), PULSE_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!alertId) {
      setStatus('disconnected');
      return;
    }

    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setStatus('disconnected');
      return;
    }

    // B0-5c: token travels in the Authorization header (fetch-based SSE), never the URL.
    const url = `/api/ha-alerts/${encodeURIComponent(alertId)}/stream`;

    const handlers: Record<string, (data: string) => void> = {
      'alert.updated': () => {
        void queryClient.invalidateQueries({ queryKey: ['alert-investigation', alertId] });
        triggerPulse('investigation');
      },
      'story.appended': (raw) => {
        const data = JSON.parse(raw) as Extract<InvestigationStreamEvent, { type: 'story.appended' }>;
        queryClient.setQueryData<AlertStoryResponse>(['alert-story', alertId], (old) =>
          old ? { ...old, items: [...old.items, data.item] } : old);
        triggerPulse('story');
      },
      'process.updated': () => {
        void queryClient.invalidateQueries({ queryKey: ['alert-processes', alertId] });
        triggerPulse('processes');
      },
      'network.appended': (raw) => {
        const data = JSON.parse(raw) as Extract<InvestigationStreamEvent, { type: 'network.appended' }>;
        queryClient.setQueryData<NetworkActivityResponse>(['alert-network', alertId], (old) =>
          old ? { ...old, connections: [...old.connections, data.connection], totalConnections: old.totalConnections + 1 } : old);
        triggerPulse('network');
      },
      'indicator.enriched': () => {
        void queryClient.invalidateQueries({ queryKey: ['alert-indicators', alertId] });
        triggerPulse('indicators');
      },
      'response.status': (raw) => {
        const data = JSON.parse(raw) as Extract<InvestigationStreamEvent, { type: 'response.status' }>;
        queryClient.setQueryData<ResponseJob>(['response-job', data.jobId], (old) =>
          old ? { ...old, status: data.status, result: data.result } : old);
        triggerPulse('response');
      },
    };

    const stream = fetchEventSource(url, {
      token,
      onOpen: () => setStatus('connected'),
      onError: () => setStatus('reconnecting'),
      onMessage: (message) => {
        const handler = handlers[message.event];
        if (!handler) return;
        try {
          handler(message.data);
        } catch {
          // Malformed event — skip
        }
      },
    });
    streamRef.current = stream;

    return () => {
      stream.close();
      streamRef.current = null;
      setStatus('disconnected');
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [alertId, queryClient, triggerPulse]);

  return { status, panelPulse };
}
