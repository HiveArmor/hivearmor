"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface LiveAlert {
  id: string;
  name: string;
  severity: string;
  status: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Connects to GET /api/alerts/stream (SSE) and returns the latest alert
 * plus the running count of alerts received in this session.
 */
export function useAlertStream(enabled = true) {
  const [latestAlert, setLatestAlert] = useState<LiveAlert | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const token = api.getToken();
    if (!token) return;

    const url = `/api/alerts/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("alert", (e) => {
      try {
        const alert = JSON.parse(e.data) as LiveAlert;
        setLatestAlert(alert);
        setAlertCount((c) => c + 1);
      } catch {
        // ignore malformed messages
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [enabled]);

  return { latestAlert, alertCount };
}
