"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type WsStatus = "disconnected" | "connecting" | "connected" | "error";

export interface TerminalMessage {
  id: number;
  text: string;
  type: "input" | "output" | "error" | "system";
  ts: number;
}

export interface CommandPayload {
  command: string;
  originType: string;
  originId: string;
  reason: string;
  shell?: string;
}

// Minimal STOMP 1.1 frame builder/parser over a native WebSocket
// (avoids needing @stomp/stompjs / sockjs-client packages)

const STOMP_NULL = "\x00";

function buildFrame(cmd: string, headers: Record<string, string>, body = ""): string {
  let frame = cmd + "\n";
  for (const [k, v] of Object.entries(headers)) frame += `${k}:${v}\n`;
  frame += "\n" + body + STOMP_NULL;
  return frame;
}

interface ParsedFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

function parseFrame(raw: string): ParsedFrame | null {
  const nullIdx = raw.indexOf(STOMP_NULL);
  const content = nullIdx >= 0 ? raw.slice(0, nullIdx) : raw;
  const newlineIdx = content.indexOf("\n\n");
  if (newlineIdx < 0) return null;
  const headerSection = content.slice(0, newlineIdx);
  const body = content.slice(newlineIdx + 2);
  const lines = headerSection.split("\n");
  const command = lines[0].trim();
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      headers[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  }
  return { command, headers, body };
}

// SockJS transport: uses the raw WebSocket transport endpoint directly
// Format: /ws/{server}/{session}/websocket?access_token=TOKEN
function buildSockJsWsUrl(baseUrl: string, token: string): string {
  const server = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  const session = Array.from({ length: 8 }, () => Math.random().toString(36)[2]).join("");
  return `${baseUrl}/ws/${server}/${session}/websocket?access_token=${token}`;
}

export function useIncidentCommandWs(hostname: string | null) {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [messages, setMessages] = useState<TerminalMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const subIdRef = useRef<string>("sub-0");
  const msgIdRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const hostnameRef = useRef(hostname);

  const addMessage = useCallback((text: string, type: TerminalMessage["type"]) => {
    setMessages(prev => [...prev, { id: msgIdRef.current++, text, type, ts: Date.now() }]);
  }, []);

  const disconnect = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (wsRef.current) {
      try { wsRef.current.send(buildFrame("DISCONNECT", {})); } catch { /* ignore */ }
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mountedRef.current) setStatus("disconnected");
  }, []);

  const connect = useCallback((host: string) => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[use-incident-command-ws] connect() called while previous WebSocket is still open — disconnecting first");
      }
      disconnect();
    }

    const token = api.getToken();
    if (!token) { setStatus("error"); return; }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const backendHost = "localhost:8088"; // direct to backend WS (not proxied)
    const url = buildSockJsWsUrl(`${protocol}//${backendHost}`, token);

    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send STOMP CONNECT frame
      ws.send(buildFrame("CONNECT", {
        "accept-version": "1.1",
        "heart-beat": "10000,10000",
      }));
    };

    ws.onmessage = (evt) => {
      const data: string = evt.data;

      // SockJS framing: "o" = open, "h" = heartbeat, "c[...]" = close, "a[...]" = array of messages
      if (data === "o") return; // SockJS open frame
      if (data === "h") return; // heartbeat
      if (data.startsWith("c")) return; // close

      if (data.startsWith("a")) {
        try {
          const arr: string[] = JSON.parse(data.slice(1));
          for (const raw of arr) handleStompFrame(raw, host);
        } catch { /* ignore malformed */ }
        return;
      }

      // Fallback: raw STOMP frame
      handleStompFrame(data, host);
    };

    ws.onerror = () => {
      if (mountedRef.current) {
        setStatus("error");
        addMessage("WebSocket connection error", "error");
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setStatus("disconnected");
      }
    };

    function handleStompFrame(raw: string, host: string) {
      const frame = parseFrame(raw);
      if (!frame) return;

      switch (frame.command) {
        case "CONNECTED":
          if (!mountedRef.current) return;
          setStatus("connected");
          addMessage(`Connected to ${host}`, "system");
          // Subscribe to user-specific topic for this hostname
          ws.send(buildFrame("SUBSCRIBE", {
            id: subIdRef.current,
            destination: `/user/topic/${host}`,
          }));
          // Heartbeat: send STOMP newline every 10s
          heartbeatRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send("\n");
          }, 10_000);
          break;

        case "MESSAGE":
          if (!mountedRef.current) return;
          addMessage(frame.body, "output");
          break;

        case "ERROR":
          if (!mountedRef.current) return;
          addMessage(frame.headers["message"] || frame.body || "Unknown error", "error");
          break;
      }
    }
  }, [disconnect, addMessage]);

  // Reconnect when hostname changes
  useEffect(() => {
    hostnameRef.current = hostname;
    if (hostname) {
      setMessages([]);
      connect(hostname);
    } else {
      disconnect();
    }
    return () => {
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  const sendCommand = useCallback((payload: CommandPayload) => {
    const ws = wsRef.current;
    const host = hostnameRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !host) return;

    const body = JSON.stringify(payload);
    ws.send(buildFrame("SEND", {
      destination: `/app/command/${host}`,
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).length),
    }, body));
  }, []);

  return { status, messages, sendCommand, addMessage, clearMessages: () => setMessages([]) };
}
