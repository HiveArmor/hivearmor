/**
 * PlaybookExecutionViewer — Sprint 18 SOAR T04
 * Right-rail drawer that shows live step-by-step execution state via SSE.
 *
 * frontend-v3/src/components/playbook/PlaybookExecutionViewer.tsx
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { Spinner } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  CircleIcon,
  ExclamationCircleIcon,
} from '@patternfly/react-icons';
import { X } from 'lucide-react';

import { HaButton } from '@/components/ha-button/HaButton';
import {
  usePlaybookExecution,
  type PlaybookExecutionState,
} from '@/hooks/usePlaybookExecution';
import { apiClient } from '@/lib/apiClient';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useThemeStore } from '@/store/theme.store';
import type { PlaybookStep } from '@/types/playbook';

// ---------------------------------------------------------------------------
// Lazy Monaco — avoids blocking the initial bundle
// ---------------------------------------------------------------------------
const Editor = lazy(() => import('@monaco-editor/react'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlaybookExecutionViewerProps {
  executionId: string | null;
  playbookSteps: PlaybookStep[];
  onClose: () => void;
  isOpen: boolean;
}

// ---------------------------------------------------------------------------
// Auto-close countdown seconds
// ---------------------------------------------------------------------------
const AUTOCLOSE_SECONDS = 3;

// ---------------------------------------------------------------------------
// Step status icon
// ---------------------------------------------------------------------------

function StepIcon({ state }: { state: PlaybookExecutionState['stepStatuses'][number]['state'] }): JSX.Element {
  switch (state) {
    case 'completed':
      return (
        <CheckCircleIcon
          style={{ color: 'var(--ha-positive)', flexShrink: 0, fontSize: 16 }}
        />
      );
    case 'failed':
      return (
        <ExclamationCircleIcon
          style={{ color: 'var(--ha-critical)', flexShrink: 0, fontSize: 16 }}
        />
      );
    case 'running':
      return (
        <Spinner
          size="sm"
          style={{ color: 'var(--ha-primary)', flexShrink: 0 }}
        />
      );
    case 'pending':
    default:
      return (
        <CircleIcon
          style={{ color: 'var(--ha-text-secondary)', flexShrink: 0, fontSize: 16 }}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// State badge label
// ---------------------------------------------------------------------------

function StateBadge({
  state,
}: {
  state: PlaybookExecutionState['stepStatuses'][number]['state'];
}): JSX.Element {
  const styleMap: Record<string, React.CSSProperties> = {
    pending:   { color: 'var(--ha-text-secondary)', borderColor: 'var(--ha-text-secondary)' },
    running:   { color: 'var(--ha-primary)',         borderColor: 'var(--ha-primary)' },
    completed: { color: 'var(--ha-positive)',        borderColor: 'var(--ha-positive)' },
    failed:    { color: 'var(--ha-critical)',        borderColor: 'var(--ha-critical)' },
  };
  const labelMap: Record<string, string> = {
    pending: 'Pending',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
  };
  const s = styleMap[state] ?? styleMap['pending'];
  return (
    <span
      style={{
        ...s,
        padding: '1px 7px',
        border: '1px solid',
        borderRadius: 4,
        fontSize: 'var(--ha-text-xs)',
        lineHeight: '18px',
        display: 'inline-block',
      }}
    >
      {labelMap[state] ?? state}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step output renderer
// ---------------------------------------------------------------------------

function StepOutput({ output }: { output: unknown }): JSX.Element | null {
  const theme = useThemeStore((state) => state.theme);

  if (output === null || output === undefined) return null;

  if (typeof output === 'string') {
    return (
      <div
        style={{
          marginTop: 6,
          color: 'var(--ha-text-secondary)',
          fontSize: 'var(--ha-text-sm)',
          fontFamily: 'var(--ha-font-mono)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {output}
      </div>
    );
  }

  if (typeof output === 'object') {
    const jsonString = JSON.stringify(output, null, 2);
    return (
      <div style={{ marginTop: 6, height: 60 }}>
        <Suspense fallback={<div style={{ height: 60, background: 'var(--ha-surface-primary)' }} />}>
          <Editor
            height={60}
            language="json"
            value={jsonString}
            theme={`hivearmor-${theme}`}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'off',
              folding: false,
              wordWrap: 'on',
              fontSize: 11,
              scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
            }}
            beforeMount={(monaco) => {
              defineHiveArmorMonacoTheme(monaco);
            }}
          />
        </Suspense>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlaybookExecutionViewer({
  executionId,
  playbookSteps,
  onClose,
  isOpen,
}: PlaybookExecutionViewerProps): JSX.Element | null {
  const { stepStatuses, playbookState } = usePlaybookExecution(executionId);

  // Auto-close countdown
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start countdown when completed
  useEffect(() => {
    if (playbookState === 'completed' && isOpen) {
      setCountdown(AUTOCLOSE_SECONDS);
    }
  }, [playbookState, isOpen]);

  // Tick down and auto-close
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      countdownRef.current = null;
      onClose();
      return;
    }

    const id = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    countdownRef.current = id;

    return () => clearTimeout(id);
  }, [countdown, onClose]);

  // Cancel countdown when close button is clicked
  const handleClose = (): void => {
    if (countdownRef.current !== null) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    onClose();
  };

  // Reset countdown when drawer is closed externally
  useEffect(() => {
    if (!isOpen) {
      if (countdownRef.current !== null) {
        clearTimeout(countdownRef.current);
        countdownRef.current = null;
      }
      setCountdown(null);
    }
  }, [isOpen]);

  // Cancel playbook
  const handleCancel = (): void => {
    if (!executionId) return;
    void apiClient.delete<void>(`/ha-playbooks/${executionId}`);
  };

  if (!isOpen) return null;

  // ----- Overall status badge -----
  const overallBadgeStyle = ((): React.CSSProperties => {
    switch (playbookState) {
      case 'running':
        return { color: 'var(--ha-primary)', borderColor: 'var(--ha-primary)' };
      case 'completed':
        return { color: 'var(--ha-positive)', borderColor: 'var(--ha-positive)' };
      case 'failed':
        return { color: 'var(--ha-critical)', borderColor: 'var(--ha-critical)' };
      case 'cancelled':
        return { color: 'var(--ha-text-secondary)', borderColor: 'var(--ha-text-secondary)' };
    }
  })();

  const overallBadgeLabel = ((): string => {
    switch (playbookState) {
      case 'running':    return 'Running';
      case 'completed':  return 'Completed';
      case 'failed':     return 'Failed';
      case 'cancelled':  return 'Cancelled';
    }
  })();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--ha-scrim)',
          zIndex: 199,
        }}
        aria-label="Close execution viewer"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pev-title"
        style={{
          position: 'fixed',
          right: 0,
          top: 56,
          bottom: 0,
          width: 480,
          zIndex: 200,
          background: 'var(--ha-surface-raised)',
          borderLeft: '1px solid var(--ha-border)',
          boxShadow: 'var(--ha-shadow-drawer)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'pevSlideIn 0.2s ease',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            minHeight: 56,
            borderBottom: '1px solid var(--ha-border)',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: title + overall status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              id="pev-title"
              style={{
                fontSize: 'var(--ha-text-md)',
                fontWeight: 600,
                color: 'var(--ha-text-primary)',
              }}
            >
              Playbook Execution
            </span>

            {/* Overall status badge */}
            <span
              style={{
                ...overallBadgeStyle,
                border: '1px solid',
                borderRadius: 4,
                padding: '1px 8px',
                fontSize: 'var(--ha-text-xs)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {playbookState === 'running' && (
                <Spinner size="sm" style={{ color: 'var(--ha-primary)' }} />
              )}
              {overallBadgeLabel}
            </span>

            {/* Auto-close countdown */}
            {countdown !== null && countdown > 0 && (
              <span
                style={{
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                Closing in {countdown}…
              </span>
            )}
          </div>

          {/* Right: Cancel + Close buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {playbookState === 'running' && (
              <HaButton variant="secondary" onClick={handleCancel}>
                Cancel
              </HaButton>
            )}
            <button
              onClick={handleClose}
              aria-label="Close execution viewer"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ha-text-secondary)',
                cursor: 'pointer',
                padding: 8,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Step timeline ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
          }}
        >
          {playbookSteps.length === 0 && (
            <div
              style={{
                color: 'var(--ha-text-secondary)',
                fontSize: 'var(--ha-text-sm)',
                textAlign: 'center',
                marginTop: 32,
              }}
            >
              No steps defined for this playbook.
            </div>
          )}

          {playbookSteps.map((step) => {
            const status = stepStatuses[step.stepIndex] ?? {
              state: 'pending' as const,
              output: null,
              errorMessage: null,
              startedAt: null,
              completedAt: null,
            };

            return (
              <div
                key={step.stepIndex}
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  background: 'var(--ha-surface-primary)',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 6,
                }}
              >
                {/* Row: icon + label + state badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <StepIcon state={status.state} />

                  <span
                    style={{
                      flex: 1,
                      fontSize: 'var(--ha-text-sm)',
                      color: 'var(--ha-text-primary)',
                      fontWeight: 500,
                    }}
                  >
                    Step {step.stepIndex + 1}: {step.label}
                  </span>

                  <StateBadge state={status.state} />
                </div>

                {/* Step output (completed only) */}
                {status.state === 'completed' && (
                  <StepOutput output={status.output} />
                )}

                {/* Step error (failed only) */}
                {status.state === 'failed' && status.errorMessage && (
                  <div
                    style={{
                      marginTop: 6,
                      color: 'var(--ha-critical)',
                      fontSize: 'var(--ha-text-sm)',
                      fontFamily: 'var(--ha-font-mono)',
                      wordBreak: 'break-word',
                    }}
                  >
                    {status.errorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes pevSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
