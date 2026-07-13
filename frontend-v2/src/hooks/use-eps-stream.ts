"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAlertStreamStore } from "@/store/alert-stream";

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function useEpsStream(enabled = true) {
  const abortRef   = useRef<AbortController | null>(null);
  const backoffRef = useRef(MIN_BACKOFF_MS);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const pushEps   = useAlertStreamStore((s) => s.pushEps);
  const setStatus = useAlertStreamStore((s) => s.setEpsStreamStatus);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    async function connect() {
      if (!mountedRef.current) return;

      const token = api.getToken();
      if (!token) return;

      abortRef.current = new AbortController();
      setStatus("connecting");

      let res: Response;
      try {
        res = await fetch("/api/eps/stream", {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortRef.current.signal,
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        if (!mountedRef.current) return;
        scheduleRetry(connect);
        return;
      }

      // 401/403 — auth failure, stop retrying
      if (res.status === 401 || res.status === 403) {
        setStatus("error");
        return;
      }

      // Any other non-2xx — retry with backoff
      if (!res.ok || !res.body) {
        if (!mountedRef.current) return;
        scheduleRetry(connect);
        return;
      }

      setStatus("connected");
      backoffRef.current = MIN_BACKOFF_MS;

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (mountedRef.current) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          let eventName = "";
          let data = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              data = line.slice(5).trim();
            } else if (line === "") {
              // Accept named "eps" events or bare data-only events
              if ((eventName === "eps" || eventName === "") && data) {
                const val = Number(data);
                if (!Number.isNaN(val)) pushEps(val);
              }
              eventName = "";
              data = "";
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }

      // Stream ended — reconnect
      if (mountedRef.current) scheduleRetry(connect);
    }

    function scheduleRetry(fn: () => void) {
      setStatus("reconnecting");
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      timerRef.current = setTimeout(fn, delay);
    }

    connect();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, pushEps, setStatus]);
}
