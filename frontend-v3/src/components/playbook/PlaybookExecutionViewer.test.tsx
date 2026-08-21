/**
 * PlaybookExecutionViewer.test.tsx — Sprint 18 SOAR T04-4.9
 *
 * Seven Vitest test cases (usePlaybookExecution is mocked in every case):
 *   1) Renders all steps with "pending" state initially
 *   2) step_started event transitions the step to "running" (spinner visible)
 *   3) step_completed event transitions the step to "completed" (green check visible)
 *   4) step_failed event transitions the step to "failed" (red X visible, error message rendered)
 *   5) playbook_completed shows the "Completed" header badge and starts the auto-close countdown
 *   6) "Cancel" button calls DELETE /api/ha-playbooks/{executionId}
 *   7) Auto-close calls onClose after 3 seconds when state is "completed"
 *
 * Mocked dependencies:
 *   - @/hooks/usePlaybookExecution         — controlled per test via mockUsePlaybookExecution
 *   - @monaco-editor/react                 — returns null (prevents real editor rendering)
 *   - @/lib/apiClient                      — spies on .delete to assert the cancel call (test 6)
 *   - @patternfly/react-core (Spinner)     — renders a div with data-testid
 *   - @patternfly/react-icons (icons)      — render divs with data-testid
 *   - @/components/ha-button/HaButton      — renders a plain <button>
 *   - @/lib/monacoTheme                    — no-ops the define function
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**
 *
 * Product name: HiveArmor
 */

import React from 'react';

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PlaybookExecutionViewer } from './PlaybookExecutionViewer';

import type { PlaybookExecutionState } from '@/hooks/usePlaybookExecution';
import type { PlaybookStep } from '@/types/playbook';

// ---------------------------------------------------------------------------
// Mock @/hooks/usePlaybookExecution — fully controlled per test
// ---------------------------------------------------------------------------

const mockUsePlaybookExecution = vi.fn();

vi.mock('@/hooks/usePlaybookExecution', () => ({
  usePlaybookExecution: (...args: unknown[]) =>
    mockUsePlaybookExecution(...args) as PlaybookExecutionState,
}));

// ---------------------------------------------------------------------------
// Mock @monaco-editor/react — prevents real editor rendering in jsdom
// ---------------------------------------------------------------------------

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Mock @/lib/monacoTheme — prevents "Cannot read properties of undefined" in jsdom
// ---------------------------------------------------------------------------

vi.mock('@/lib/monacoTheme', () => ({
  defineHiveArmorMonacoTheme: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @patternfly/react-core — replace Spinner with a testid stub
// ---------------------------------------------------------------------------

vi.mock('@patternfly/react-core', () => ({
  Spinner: ({ size }: { size?: string; style?: React.CSSProperties }) => (
    <div data-testid="pf-spinner" data-size={size} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @patternfly/react-icons — replace icons with testid stubs
// ---------------------------------------------------------------------------

vi.mock('@patternfly/react-icons', () => ({
  CheckCircleIcon: ({ style }: { style?: React.CSSProperties }) => (
    <div data-testid="icon-check-circle" style={style} />
  ),
  ExclamationCircleIcon: ({ style }: { style?: React.CSSProperties }) => (
    <div data-testid="icon-exclamation-circle" style={style} />
  ),
  CircleIcon: ({ style }: { style?: React.CSSProperties }) => (
    <div data-testid="icon-circle" style={style} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ha-button/HaButton — renders a plain <button>
// ---------------------------------------------------------------------------

vi.mock('@/components/ha-button/HaButton', () => ({
  HaButton: ({
    children,
    onClick,
    variant,
    ...rest
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} data-variant={variant} {...rest}>
      {children}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/apiClient — spy on .delete to assert cancel call
// ---------------------------------------------------------------------------

const mockApiDelete = vi.fn((_path?: string, _options?: unknown) => Promise.resolve());

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: (path: string, options?: unknown) =>
      options !== undefined ? mockApiDelete(path, options) : mockApiDelete(path),
  },
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<PlaybookStep> = {}): PlaybookStep {
  return {
    stepIndex: 0,
    stepType: 'action',
    label: 'Isolate Host',
    config: {},
    ...overrides,
  };
}

const TWO_STEPS: PlaybookStep[] = [
  makeStep({ stepIndex: 0, label: 'Check Severity' }),
  makeStep({ stepIndex: 1, label: 'Isolate Host' }),
];

function idleState(
  overrides: Partial<PlaybookExecutionState> = {},
): PlaybookExecutionState {
  return {
    stepStatuses: {},
    playbookState: 'running',
    events: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper — always provides minimum required props
// ---------------------------------------------------------------------------

interface RenderProps {
  executionId?: string | null;
  playbookSteps?: PlaybookStep[];
  onClose?: () => void;
  isOpen?: boolean;
}

function renderViewer({
  executionId = 'exec-test-001',
  playbookSteps = TWO_STEPS,
  onClose = vi.fn(),
  isOpen = true,
}: RenderProps = {}) {
  return render(
    <PlaybookExecutionViewer
      executionId={executionId}
      playbookSteps={playbookSteps}
      onClose={onClose}
      isOpen={isOpen}
    />,
  );
}

// ---------------------------------------------------------------------------
// Default before each — clear all mocks; install idle execution state
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePlaybookExecution.mockReturnValue(idleState());
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaybookExecutionViewer', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Renders all steps with "pending" state initially
  // ─────────────────────────────────────────────────────────────────────────
  it('renders all playbook steps with "pending" state icons initially', () => {
    // Hook returns empty stepStatuses → every step defaults to "pending"
    // playbookState is 'running' so the header badge shows its own Spinner —
    // the step-level icons should all be CircleIcon (pending).
    mockUsePlaybookExecution.mockReturnValue(idleState());

    renderViewer();

    // Step labels should be visible
    expect(screen.getByText('Step 1: Check Severity')).toBeDefined();
    expect(screen.getByText('Step 2: Isolate Host')).toBeDefined();

    // Two CircleIcon stubs should be rendered (one per pending step)
    const pendingIcons = screen.getAllByTestId('icon-circle');
    expect(pendingIcons.length).toBe(2);

    // The header Spinner exists (playbookState=running badge) but no step
    // cards should show a Spinner — the step timeline area has no spinner.
    // There should be exactly one spinner (only the header badge spinner).
    const spinners = screen.getAllByTestId('pf-spinner');
    expect(spinners.length).toBe(1); // header badge spinner only

    // No check or exclamation icons in the whole tree
    expect(screen.queryByTestId('icon-check-circle')).toBeNull();
    expect(screen.queryByTestId('icon-exclamation-circle')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. step_started event → step transitions to "running" (spinner visible)
  // ─────────────────────────────────────────────────────────────────────────
  it('shows a Spinner for the running step when stepStatuses has state "running"', () => {
    mockUsePlaybookExecution.mockReturnValue(
      idleState({
        stepStatuses: {
          0: {
            state: 'running',
            output: null,
            errorMessage: null,
            startedAt: '2026-07-25T10:00:00.000Z',
            completedAt: null,
          },
        },
      }),
    );

    renderViewer();

    // playbookState is still 'running' → header badge also has a Spinner.
    // So there should be 2 spinners total: one in the header, one in step 1.
    const spinners = screen.getAllByTestId('pf-spinner');
    expect(spinners.length).toBe(2);

    // Step 2 should still show a CircleIcon (pending)
    expect(screen.getByTestId('icon-circle')).toBeDefined();

    // No check or exclamation icon
    expect(screen.queryByTestId('icon-check-circle')).toBeNull();
    expect(screen.queryByTestId('icon-exclamation-circle')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. step_completed event → step transitions to "completed" (green check)
  // ─────────────────────────────────────────────────────────────────────────
  it('shows CheckCircleIcon for the completed step when stepStatuses has state "completed"', () => {
    mockUsePlaybookExecution.mockReturnValue(
      idleState({
        stepStatuses: {
          0: {
            state: 'completed',
            output: 'host isolated',
            errorMessage: null,
            startedAt: '2026-07-25T10:00:00.000Z',
            completedAt: '2026-07-25T10:00:05.000Z',
          },
        },
      }),
    );

    renderViewer();

    // Step 1 completed → CheckCircleIcon
    expect(screen.getByTestId('icon-check-circle')).toBeDefined();

    // Step 2 still pending → CircleIcon
    expect(screen.getByTestId('icon-circle')).toBeDefined();

    // The header badge has a Spinner because playbookState is still 'running'
    // but no step-level spinner exists (step 1 is completed, step 2 is pending).
    // Exactly one spinner total (header badge only).
    const spinners = screen.getAllByTestId('pf-spinner');
    expect(spinners.length).toBe(1);

    // No exclamation icon
    expect(screen.queryByTestId('icon-exclamation-circle')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. step_failed event → step transitions to "failed"
  //    (ExclamationCircleIcon visible, error message rendered)
  // ─────────────────────────────────────────────────────────────────────────
  it('shows ExclamationCircleIcon and the error message when a step has state "failed"', () => {
    const ERROR_MSG = 'Agent unreachable at 192.168.1.10';

    mockUsePlaybookExecution.mockReturnValue(
      idleState({
        stepStatuses: {
          1: {
            state: 'failed',
            output: null,
            errorMessage: ERROR_MSG,
            startedAt: '2026-07-25T10:00:00.000Z',
            completedAt: '2026-07-25T10:00:03.000Z',
          },
        },
      }),
    );

    renderViewer();

    // ExclamationCircleIcon present for the failed step
    expect(screen.getByTestId('icon-exclamation-circle')).toBeDefined();

    // Error message text is rendered below the step card
    expect(screen.getByText(ERROR_MSG)).toBeDefined();

    // Step 1 still pending → CircleIcon
    expect(screen.getByTestId('icon-circle')).toBeDefined();

    // No check icon
    expect(screen.queryByTestId('icon-check-circle')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. playbook_completed → "Completed" header badge, countdown starts
  // ─────────────────────────────────────────────────────────────────────────
  it('displays the "Completed" badge in the header when playbookState is "completed"', () => {
    vi.useFakeTimers();

    mockUsePlaybookExecution.mockReturnValue(
      idleState({ playbookState: 'completed' }),
    );

    renderViewer();

    // The overall status badge should read "Completed"
    expect(screen.getByText('Completed')).toBeDefined();

    // The Cancel button (shown only while running) must NOT be present
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();

    // The countdown text should appear — "Closing in 3…"
    expect(screen.getByText(/Closing in/i)).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. "Cancel" button calls DELETE /api/ha-playbooks/{executionId}
  // ─────────────────────────────────────────────────────────────────────────
  it('calls apiClient.delete with the correct URL when the Cancel button is clicked', async () => {
    const EXECUTION_ID = 'exec-cancel-test';

    mockUsePlaybookExecution.mockReturnValue(idleState({ playbookState: 'running' }));

    renderViewer({ executionId: EXECUTION_ID });

    // Cancel button is present while the execution is running
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeDefined();

    fireEvent.click(cancelButton);

    // apiClient.delete should be called with the relative path (no /api prefix — apiClient prepends it)
    expect(mockApiDelete).toHaveBeenCalledTimes(1);
    expect(mockApiDelete).toHaveBeenCalledWith(`/ha-playbooks/${EXECUTION_ID}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Auto-close calls onClose after 3 seconds when state is "completed"
  // ─────────────────────────────────────────────────────────────────────────
  it('calls onClose after 3 seconds when playbookState is "completed"', () => {
    vi.useFakeTimers();

    const mockOnClose = vi.fn();

    mockUsePlaybookExecution.mockReturnValue(
      idleState({ playbookState: 'completed' }),
    );

    renderViewer({ onClose: mockOnClose });

    // onClose must NOT be called immediately
    expect(mockOnClose).not.toHaveBeenCalled();

    // The component decrements the countdown by 1 every second using setTimeout.
    // Advancing 1000ms at a time triggers each React state update in sequence.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(mockOnClose).not.toHaveBeenCalled(); // countdown: 3 → 2

    act(() => { vi.advanceTimersByTime(1000); });
    expect(mockOnClose).not.toHaveBeenCalled(); // countdown: 2 → 1

    act(() => { vi.advanceTimersByTime(1000); });
    // countdown: 1 → 0 → onClose()
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
