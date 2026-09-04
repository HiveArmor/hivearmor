/**
 * useConstellationStream — SSE hook for CON-005 constellation freshness.
 * Connects when a snapshotId exists; updates Zustand store on events.
 * Handles reconnection, Last-Event-ID, and graceful snapshot expiry.
 */

import { useCallback, useEffect, useRef } from 'react';


import { useConstellationStore } from './useConstellationStore';
import type {
  EdgeStrengthChangedData,
  NodeDiscoveredData,
  NodeRiskChangedData,
  RiskLevel,
  SseEventType,
} from '../types/constellation.types';

import { fetchEventSource, type FetchEventSourceHandle } from '@/lib/fetchEventSource';


const SSE_BASE_PATH = '/api/ha-constellation/stream';
const RECONNECT_DELAY_MS = 3000;

export function useConstellationStream(snapshotId: string | null): void {
  const eventSourceRef = useRef<FetchEventSourceHandle | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addNodes = useConstellationStore((s) => s.addNodes);
  const addEdges = useConstellationStore((s) => s.addEdges);
  const updateNodeRisk = useConstellationStore((s) => s.updateNodeRisk);

  const handleEvent = useCallback(
    (eventType: SseEventType, rawData: string) => {
      try {
        const parsed = JSON.parse(rawData) as { data: Record<string, unknown> };
        const data = parsed.data ?? parsed;

        switch (eventType) {
          case 'node.risk_changed': {
            const payload = data as unknown as NodeRiskChangedData;
            if (payload.nodeId) {
              updateNodeRisk(payload.nodeId, payload.newScore, payload.newLevel);
            }
            break;
          }
          case 'node.alert_added': {
            // Alert count incremented server-side; we re-fetch on next interaction
            break;
          }
          case 'edge.strength_changed': {
            const payload = data as unknown as EdgeStrengthChangedData;
            // Edge updates handled by store subscription if needed
            void payload;
            break;
          }
          case 'edge.discovered': {
            const edgeData = data as unknown as {
              edgeId: string;
              source: string;
              target: string;
              relationshipType: string;
              strength: number;
              confidence: number;
              label: string;
              eventCount: number;
              firstSeen: string;
              lastSeen: string;
            };
            if (edgeData.edgeId) {
              addEdges([{
                id: edgeData.edgeId,
                source: edgeData.source,
                target: edgeData.target,
                relationshipType: edgeData.relationshipType,
                strength: edgeData.strength ?? 0.5,
                confidence: edgeData.confidence ?? 0.5,
                label: edgeData.label ?? edgeData.relationshipType,
                eventCount: edgeData.eventCount ?? 1,
                firstSeen: edgeData.firstSeen ?? new Date().toISOString(),
                lastSeen: edgeData.lastSeen ?? new Date().toISOString(),
              }]);
            }
            break;
          }
          case 'node.discovered': {
            const payload = data as unknown as NodeDiscoveredData;
            if (payload.discoveredEntity) {
              const entity = payload.discoveredEntity;
              addNodes([{
                id: entity.id,
                entityId: entity.id,
                type: entity.type,
                value: entity.value,
                displayName: entity.value,
                riskScore: entity.riskScore,
                riskLevel: riskLevelFromScore(entity.riskScore),
                alertCount: 0,
                size: 1,
                group: null,
                expandable: true,
                expanded: false,
                pivots: [],
              }]);
            }
            break;
          }
          case 'snapshot.expired': {
            // Connection will close; no action needed
            break;
          }
        }
      } catch {
        // Silently ignore malformed SSE data
      }
    },
    [addEdges, addNodes, updateNodeRisk]
  );

  const connect = useCallback(() => {
    if (!snapshotId) return;

    // Clean up any previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const token = localStorage.getItem('hivearmor_auth_token');
    if (!token) return;

    // B0-5c: token in the Authorization header (fetch-based SSE), never the URL. Only the
    // non-secret snapshot id stays in the query string. The client replays Last-Event-ID and
    // reconnects internally, so no manual reconnect timer is needed here.
    const url = `${SSE_BASE_PATH}?snapshot=${encodeURIComponent(snapshotId)}`;
    const knownEvents = new Set<SseEventType>([
      'node.risk_changed',
      'node.alert_added',
      'edge.strength_changed',
      'edge.discovered',
      'node.discovered',
      'snapshot.expired',
    ]);

    const stream = fetchEventSource(url, {
      token,
      reconnectDelayMs: RECONNECT_DELAY_MS,
      onMessage: (message) => {
        if (!knownEvents.has(message.event as SseEventType)) return;
        if (message.id) lastEventIdRef.current = message.id;
        handleEvent(message.event as SseEventType, message.data);
      },
    });
    eventSourceRef.current = stream;
  }, [snapshotId, handleEvent]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
