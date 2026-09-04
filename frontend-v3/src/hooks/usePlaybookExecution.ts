/**
 * HiveArmor SOAR — Playbook Execution Hook
 * Sprint 18 — T04 · frontend-v3/src/hooks/usePlaybookExecution.ts
 *
 * Connects to the SSE endpoint for a live playbook execution view.
 * B0-5c: authenticates via the `Authorization: Bearer` header using a fetch-based SSE reader,
 * so the JWT never travels in the URL query string.
 */

import { useEffect, useRef, useState } from 'react';

import type {
  PlaybookExecutionEvent,
  StepExecutionState,
  StepExecutionStatus,
} from '../types/playbook';

import { fetchEventSource, type FetchEventSourceHandle } from '@/lib/fetchEventSource';


// ---------------------------------------------------------------------------
// Public state shape
// ---------------------------------------------------------------------------

export interface PlaybookExecutionState {
  stepStatuses: Record<number, StepExecutionStatus>;
  playbookState: 'running' | 'completed' | 'failed' | 'cancelled';
  events: PlaybookExecutionEvent[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_STATE: PlaybookExecutionState = {
  stepStatuses: {},
  playbookState: 'running',
  events: [],
};

function buildInitialStepStatus(): StepExecutionStatus {
  return {
    state: 'pending',
    output: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a live playbook execution SSE stream.
 *
 * @param executionId  UUID of the execution to watch, or `null` to idle.
 * @returns            Live execution state reflecting all SSE events received so far.
 */
export function usePlaybookExecution(
  executionId: string | null,
): PlaybookExecutionState {
  const [state, setState] = useState<PlaybookExecutionState>(INITIAL_STATE);

  // Keep a ref to the stream so the cleanup callback can close it without
  // capturing a stale closure.
  const esRef = useRef<FetchEventSourceHandle | null>(null);

  useEffect(() => {
    // Reset to initial state whenever executionId changes (including to null).
    setState(INITIAL_STATE);

    if (!executionId) {
      return;
    }

    // Read the JWT from localStorage.  Never log the token value.
    const token = localStorage.getItem('hivearmor_auth_token') ?? '';

    // B0-5c: token in the Authorization header (fetch-based SSE), never the URL.
    const url = `/api/ha-playbooks/${encodeURIComponent(executionId)}/stream`;

    // Registered per SSE event name; dispatched from onMessage below.
    const handlers: Record<string, (raw: string) => void> = {};
    const on = (event: string, handler: (raw: string) => void): void => {
      handlers[event] = handler;
    };

    // ------------------------------------------------------------------
    // step_started
    // ------------------------------------------------------------------
    on('step_started', (raw) => {
      try {
        const data = JSON.parse(raw) as {
          stepIndex: number;
          timestamp: string;
        };
        const { stepIndex, timestamp } = data;

        const event: PlaybookExecutionEvent = {
          type: 'step_started',
          stepIndex,
          stepLabel: null,
          stepType: null,
          output: null,
          errorMessage: null,
          timestamp,
        };

        setState((prev) => {
          const existing: StepExecutionStatus =
            prev.stepStatuses[stepIndex] ?? buildInitialStepStatus();
          return {
            ...prev,
            stepStatuses: {
              ...prev.stepStatuses,
              [stepIndex]: {
                ...existing,
                state: 'running' as StepExecutionState,
                startedAt: timestamp,
              },
            },
            events: [...prev.events, event],
          };
        });
      } catch {
        // silently ignore malformed events
      }
    });

    // ------------------------------------------------------------------
    // step_completed
    // ------------------------------------------------------------------
    on('step_completed', (raw) => {
      try {
        const data = JSON.parse(raw) as {
          stepIndex: number;
          output: unknown;
          timestamp: string;
        };
        const { stepIndex, output, timestamp } = data;

        const event: PlaybookExecutionEvent = {
          type: 'step_completed',
          stepIndex,
          stepLabel: null,
          stepType: null,
          output,
          errorMessage: null,
          timestamp,
        };

        setState((prev) => {
          const existing: StepExecutionStatus =
            prev.stepStatuses[stepIndex] ?? buildInitialStepStatus();
          return {
            ...prev,
            stepStatuses: {
              ...prev.stepStatuses,
              [stepIndex]: {
                ...existing,
                state: 'completed' as StepExecutionState,
                output,
                completedAt: timestamp,
              },
            },
            events: [...prev.events, event],
          };
        });
      } catch {
        // silently ignore malformed events
      }
    });

    // ------------------------------------------------------------------
    // step_failed
    // ------------------------------------------------------------------
    on('step_failed', (raw) => {
      try {
        const data = JSON.parse(raw) as {
          stepIndex: number;
          errorMessage: string;
          timestamp: string;
        };
        const { stepIndex, errorMessage, timestamp } = data;

        const event: PlaybookExecutionEvent = {
          type: 'step_failed',
          stepIndex,
          stepLabel: null,
          stepType: null,
          output: null,
          errorMessage,
          timestamp,
        };

        setState((prev) => {
          const existing: StepExecutionStatus =
            prev.stepStatuses[stepIndex] ?? buildInitialStepStatus();
          return {
            ...prev,
            stepStatuses: {
              ...prev.stepStatuses,
              [stepIndex]: {
                ...existing,
                state: 'failed' as StepExecutionState,
                errorMessage,
                completedAt: timestamp,
              },
            },
            events: [...prev.events, event],
          };
        });
      } catch {
        // silently ignore malformed events
      }
    });

    // ------------------------------------------------------------------
    // playbook_completed
    // ------------------------------------------------------------------
    on('playbook_completed', (raw) => {
      try {
        const data = JSON.parse(raw) as { timestamp: string };

        const event: PlaybookExecutionEvent = {
          type: 'playbook_completed',
          stepIndex: null,
          stepLabel: null,
          stepType: null,
          output: null,
          errorMessage: null,
          timestamp: data.timestamp,
        };

        setState((prev) => ({
          ...prev,
          playbookState: 'completed',
          events: [...prev.events, event],
        }));
      } catch {
        // silently ignore malformed events
      }

      // Terminal event — close the stream.
      esRef.current?.close();
    });

    // ------------------------------------------------------------------
    // playbook_failed
    // ------------------------------------------------------------------
    on('playbook_failed', (raw) => {
      try {
        const data = JSON.parse(raw) as { timestamp: string };

        const event: PlaybookExecutionEvent = {
          type: 'playbook_failed',
          stepIndex: null,
          stepLabel: null,
          stepType: null,
          output: null,
          errorMessage: null,
          timestamp: data.timestamp,
        };

        setState((prev) => ({
          ...prev,
          playbookState: 'failed',
          events: [...prev.events, event],
        }));
      } catch {
        // silently ignore malformed events
      }

      // Terminal event — close the stream.
      esRef.current?.close();
    });

    // ------------------------------------------------------------------
    // Transport error
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Open the authenticated stream and dispatch to the registered handlers.
    // ------------------------------------------------------------------
    const stream = fetchEventSource(url, {
      token,
      onError: () => setState((prev) => ({ ...prev, playbookState: 'failed' })),
      onMessage: (message) => {
        const handler = handlers[message.event];
        if (handler) handler(message.data);
      },
    });
    esRef.current = stream;

    // ------------------------------------------------------------------
    // Cleanup: close the stream when executionId changes or unmounts
    // ------------------------------------------------------------------
    return () => {
      stream.close();
      esRef.current = null;
    };
  }, [executionId]);

  return state;
}
