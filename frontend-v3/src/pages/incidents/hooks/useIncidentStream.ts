/**
 * useIncidentStream — EventSource hook connecting to `/api/ha-incidents/${id}/stream`.
 * Dispatches SSE events to invalidate relevant TanStack Query keys.
 */

import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { IncidentSseEvent, SseEventType } from '../types/incident-workbench.types';

import { fetchEventSource, type FetchEventSourceHandle } from '@/lib/fetchEventSource';


/** Maps SSE event types to the query keys they should invalidate. */
function getInvalidationKeys(incidentId: string, eventType: SseEventType): unknown[][] {
  switch (eventType) {
    case 'incident.updated':
      return [['incident', incidentId]];
    case 'task.updated':
      return [['incident-tasks', incidentId]];
    case 'activity.created':
      return [['incident-activity', incidentId]];
    case 'evidence.created':
    case 'evidence.updated':
      return [['incident-evidence', incidentId]];
    case 'response_action.completed':
      return [
        ['response-actions', incidentId],
        ['incident-activity', incidentId],
      ];
    default:
      return [];
  }
}

export interface UseIncidentStreamOptions {
  enabled?: boolean;
  onEvent?: (event: IncidentSseEvent) => void;
}

export function useIncidentStream(
  incidentId: string | undefined,
  options: UseIncidentStreamOptions = {}
): void {
  const { enabled = true, onEvent } = options;
  const queryClient = useQueryClient();
  const streamRef = useRef<FetchEventSourceHandle | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!incidentId || !enabled) return;
    const activeIncidentId = incidentId;

    const token = localStorage.getItem('hivearmor_auth_token');
    if (!token) return;
    // B0-5c: token in the Authorization header (fetch-based SSE), never the URL.
    const url = `/api/ha-incidents/${encodeURIComponent(activeIncidentId)}/stream`;

    const EVENT_TYPES = new Set<SseEventType>([
      'incident.updated',
      'task.updated',
      'activity.created',
      'evidence.created',
      'evidence.updated',
      'response_action.completed',
    ]);

    const stream = fetchEventSource(url, {
      token,
      onMessage: (message) => {
        if (!EVENT_TYPES.has(message.event as SseEventType)) return;
        try {
          const parsed = JSON.parse(message.data) as IncidentSseEvent;
          for (const key of getInvalidationKeys(activeIncidentId, parsed.type)) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
          onEventRef.current?.(parsed);
        } catch {
          // Ignore malformed events
        }
      },
    });
    streamRef.current = stream;

    return () => {
      stream.close();
      streamRef.current = null;
    };
  }, [incidentId, enabled, queryClient]);
}
