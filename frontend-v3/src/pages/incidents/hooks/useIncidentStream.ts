/**
 * useIncidentStream — EventSource hook connecting to `/api/ha-incidents/${id}/stream`.
 * Dispatches SSE events to invalidate relevant TanStack Query keys.
 */

import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { IncidentSseEvent, SseEventType } from '../types/incident-workbench.types';

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
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!incidentId || !enabled) return;
    const activeIncidentId = incidentId;

    const token = localStorage.getItem('hivearmor_auth_token');
    const url = `/api/ha-incidents/${encodeURIComponent(activeIncidentId)}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const EVENT_TYPES: SseEventType[] = [
      'incident.updated',
      'task.updated',
      'activity.created',
      'evidence.created',
      'evidence.updated',
      'response_action.completed',
    ];

    function handleEvent(messageEvent: MessageEvent): void {
      try {
        const parsed = JSON.parse(messageEvent.data as string) as IncidentSseEvent;

        // Invalidate relevant queries
        const keys = getInvalidationKeys(activeIncidentId, parsed.type);
        for (const key of keys) {
          void queryClient.invalidateQueries({ queryKey: key });
        }

        // Notify listener if provided
        onEventRef.current?.(parsed);
      } catch {
        // Ignore malformed events
      }
    }

    for (const type of EVENT_TYPES) {
      eventSource.addEventListener(type, handleEvent);
    }

    eventSource.onerror = () => {
      // EventSource auto-reconnects; we just log
      // No action needed — browser handles reconnection
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [incidentId, enabled, queryClient]);
}
