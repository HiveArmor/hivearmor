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
  const eventSourceRef = useRef<EventSource | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadErrorRef = useRef(false);

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

    const url = `/api/ha-alerts/${encodeURIComponent(alertId)}/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    // --- Connection lifecycle ---
    es.onopen = () => {
      if (hadErrorRef.current) {
        // Reconnected after an error — was "reconnecting", now "connected"
        hadErrorRef.current = false;
      }
      setStatus('connected');
    };

    es.onerror = () => {
      hadErrorRef.current = true;
      // EventSource auto-reconnects — mark as reconnecting unless closed
      if (es.readyState === EventSource.CLOSED) {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
    };

    // --- Event type handlers ---

    es.addEventListener('alert.updated', (event: MessageEvent) => {
      try {
        JSON.parse(event.data) as InvestigationStreamEvent;
        void queryClient.invalidateQueries({ queryKey: ['alert-investigation', alertId] });
        triggerPulse('investigation');
      } catch {
        // Malformed event — skip
      }
    });

    es.addEventListener('story.appended', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Extract<InvestigationStreamEvent, { type: 'story.appended' }>;
        queryClient.setQueryData<AlertStoryResponse>(
          ['alert-story', alertId],
          (old) => {
            if (!old) return old;
            return { ...old, items: [...old.items, data.item] };
          },
        );
        triggerPulse('story');
      } catch {
        // Malformed event — skip
      }
    });

    es.addEventListener('process.updated', (event: MessageEvent) => {
      try {
        JSON.parse(event.data) as InvestigationStreamEvent;
        void queryClient.invalidateQueries({ queryKey: ['alert-processes', alertId] });
        triggerPulse('processes');
      } catch {
        // Malformed event — skip
      }
    });

    es.addEventListener('network.appended', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Extract<InvestigationStreamEvent, { type: 'network.appended' }>;
        queryClient.setQueryData<NetworkActivityResponse>(
          ['alert-network', alertId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              connections: [...old.connections, data.connection],
              totalConnections: old.totalConnections + 1,
            };
          },
        );
        triggerPulse('network');
      } catch {
        // Malformed event — skip
      }
    });

    es.addEventListener('indicator.enriched', (event: MessageEvent) => {
      try {
        JSON.parse(event.data) as InvestigationStreamEvent;
        void queryClient.invalidateQueries({ queryKey: ['alert-indicators', alertId] });
        triggerPulse('indicators');
      } catch {
        // Malformed event — skip
      }
    });

    es.addEventListener('response.status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Extract<InvestigationStreamEvent, { type: 'response.status' }>;
        queryClient.setQueryData<ResponseJob>(
          ['response-job', data.jobId],
          (old) => {
            if (!old) return old;
            return { ...old, status: data.status, result: data.result };
          },
        );
        triggerPulse('response');
      } catch {
        // Malformed event — skip
      }
    });

    // --- Cleanup ---
    return () => {
      es.close();
      eventSourceRef.current = null;
      setStatus('disconnected');
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [alertId, queryClient, triggerPulse]);

  return { status, panelPulse };
}
