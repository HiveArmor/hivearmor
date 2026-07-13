"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/**
 * Connects to GET /api/eps/stream (SSE) and returns the live EPS value.
 * Falls back to `fallbackEps` if SSE is unavailable or not yet connected.
 */
export function useEpsStream(fallbackEps = 0) {
  const [eps, setEps] = useState(fallbackEps);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    const url = `/api/eps/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("eps", (e) => {
      const val = Number(e.data);
      if (!Number.isNaN(val)) {
        setEps(val);
        setConnected(true);
      }
    });

    es.onopen = () => setConnected(true);

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { eps, connected };
}
