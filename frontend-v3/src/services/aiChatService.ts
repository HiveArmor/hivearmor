/**
 * AI Chat Service (Sprint 25).
 *
 * All requests carry the JWT from localStorage in the Authorization header only —
 * never in the URL path, query string, or fragment (NoJwtInUrlInvariant).
 *
 * SSE streaming uses raw fetch + ReadableStream + TextDecoder because the shared
 * apiClient does not support event-stream responses.
 */

import type {
  AiChatMessage,
  AiChatHistoryEntry,
  AiChatStreamEvent,
  AiContextType,
  AiTriageResult,
  AiStatusResponse,
  AiIncidentSummary,
} from '@/types/ai.types';

const JWT_KEY = 'hivearmor_auth_token';
const AI_BASE = '/api/ha-ai';
const ADMIN_BASE = '/api/ha-admin/settings';

/**
 * Builds the Authorization header from the JWT stored in localStorage.
 * The token NEVER appears in the URL, query string, or fragment.
 */
function authHeaders(): HeadersInit {
  const token = window.localStorage.getItem(JWT_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

/**
 * Streams an AI chat response as an async generator of typed SSE events.
 *
 * Reads the response body via `getReader()` + `TextDecoder`, splits on `\n`,
 * holds partial lines in a buffer, and parses `data:` frames as JSON.
 * Returns (terminates the generator) on the first `done: true` event.
 *
 * Requirements: 5.5, 5.6, 9.3, 9.10, 22.5, 22.6
 */
export async function* streamChat(
  messages: AiChatMessage[],
  contextType: AiContextType,
  contextId?: string,
): AsyncGenerator<AiChatStreamEvent> {
  const response = await fetch(`${AI_BASE}/chat`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ messages, contextType, contextId }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI chat failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // hold partial line

    for (const raw of lines) {
      if (!raw.startsWith('data:')) continue;
      const json = raw.slice('data:'.length).trim();
      if (!json) continue;
      const evt = JSON.parse(json) as AiChatStreamEvent;
      yield evt;
      if (evt.done) return;
    }
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function saveHistory(
  messages: AiChatMessage[],
  contextType: AiContextType,
  contextId?: string,
): Promise<AiChatHistoryEntry> {
  const response = await fetch(`${AI_BASE}/chat/history`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ messages, contextType, contextId }),
  });
  if (!response.ok) throw new Error(`AI chat failed: ${response.status}`);
  return response.json() as Promise<AiChatHistoryEntry>;
}

export async function getHistory(
  contextType: AiContextType,
  contextId?: string,
): Promise<AiChatHistoryEntry[]> {
  const params = new URLSearchParams({ contextType });
  if (contextId) params.set('contextId', contextId);

  const response = await fetch(`${AI_BASE}/chat/history?${params.toString()}`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`AI chat failed: ${response.status}`);
  return response.json() as Promise<AiChatHistoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

export async function generateTriage(alertId: string): Promise<AiTriageResult> {
  const response = await fetch(`${AI_BASE}/triage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ alertId }),
  });
  if (!response.ok) throw new Error(`AI chat failed: ${response.status}`);
  return response.json() as Promise<AiTriageResult>;
}

// ---------------------------------------------------------------------------
// AI status
// ---------------------------------------------------------------------------

export async function getAiStatus(): Promise<AiStatusResponse> {
  const response = await fetch(`${ADMIN_BASE}/ai/status`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`AI chat failed: ${response.status}`);
  return response.json() as Promise<AiStatusResponse>;
}

// ---------------------------------------------------------------------------
// Incident summary
// ---------------------------------------------------------------------------

export async function generateIncidentSummary(incidentId: string): Promise<AiIncidentSummary> {
  const response = await fetch(`${AI_BASE}/incident-summary`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ incidentId }),
  });
  if (!response.ok) throw new Error(`AI chat failed: ${response.status}`);
  return response.json() as Promise<AiIncidentSummary>;
}

// ---------------------------------------------------------------------------
// Named aggregate export
// ---------------------------------------------------------------------------

export const aiChatService = {
  streamChat,
  saveHistory,
  getHistory,
  generateTriage,
  getAiStatus,
  generateIncidentSummary,
};
