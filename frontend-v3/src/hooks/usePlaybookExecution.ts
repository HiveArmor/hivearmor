/**
 * HiveArmor SOAR — Playbook Execution Hook
 * Sprint 18 — T04 · frontend-v3/src/hooks/usePlaybookExecution.ts
 *
 * Connects to the SSE endpoint for a live playbook execution view.
 * Authenticates via `?token=` query parameter — the only endpoint in the codebase
 * that uses this pattern, because native EventSource cannot set Authorization headers.
 * This pattern MUST NOT be replicated on any non-SSE endpoint.
 */

import { useEffect, useRef, useState } from 'react';

import type {
  PlaybookExecutionEvent,
  StepExecutionState,
  StepExecutionStatus,
} from '../types/playbook';

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

  // Keep a ref to the EventSource so the cleanup callback can close it without
  // capturing a stale closure.
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Reset to initial state whenever executionId changes (including to null).
    setState(INITIAL_STATE);

    if (!executionId) {
      return;
    }

    // Read the JWT from localStorage.  Never log the token value.
    const token = localStorage.getItem('hivearmor_auth_token') ?? '';

    const url =
      `/api/ha-playbooks/${encodeURIComponent(executionId)}/stream` +
      `?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    esRef.current = es;

    // ------------------------------------------------------------------
    // step_started
    // ------------------------------------------------------------------
    es.addEventListener('step_started', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
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
    es.addEventListener('step_completed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
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
    es.addEventListener('step_failed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
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
    es.addEventListener('playbook_completed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { timestamp: string };

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
      es.close();
    });

    // ------------------------------------------------------------------
    // playbook_failed
    // ------------------------------------------------------------------
    es.addEventListener('playbook_failed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { timestamp: string };

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
      es.close();
    });

    // ------------------------------------------------------------------
    // Transport error
    // ------------------------------------------------------------------
    es.onerror = () => {
      setState((prev) => ({ ...prev, playbookState: 'failed' }));
      es.close();
    };

    // ------------------------------------------------------------------
    // Cleanup: close the EventSource when executionId changes or unmounts
    // ------------------------------------------------------------------
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [executionId]);

  return state;
}
