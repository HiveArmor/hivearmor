/**
 * Property-based test for DslPreviewPanel — reset-to-prop-dsl invariant.
 *
 * Feature: sprint-26-nl-search
 * **Property 13: `DslPreviewPanel` resets to `props.dsl` on prop change and on Cancel**
 * **Validates: Requirements 9.5, 9.7, 9.8**
 *
 * Two properties are verified:
 *
 *   Property A — re-rendering with a new `dsl` prop resets state:
 *     For arbitrary DSL strings A and B (where A !== B):
 *     - Render with `dsl={A}`
 *     - Re-render (rerender) with `dsl={B}`
 *     - Assert the Edit toggle shows "Edit" (editing === false)
 *     - The Monaco mock's data-value attribute reflects `B` (currentDsl === B)
 *
 *   Property B — clicking Cancel reverts `currentDsl` to `props.dsl`:
 *     For arbitrary DSL strings `initial` and `edited` (where initial !== edited):
 *     - Render with `dsl={initial}`
 *     - Click "Edit" → component enters editing mode
 *     - Simulate Monaco onChange to `edited`
 *     - Click "Cancel edit" → editing === false
 *     - Assert Edit toggle shows "Edit"
 *     - Assert Monaco mock's data-value reverts to `initial`
 *
 * Minimum iterations: 100 (Property A: 100, Property B: 100)
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { describe, test, expect, vi, afterEach } from 'vitest';

import { DslPreviewPanel } from '../DslPreviewPanel';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Monaco editor mock.
 * - Exposes the current value via `data-value` so tests can assert on it.
 * - Exposes readOnly state via `data-readonly`.
 * - Renders a hidden "change" button that fires onChange with a configurable
 *   value — tests drive this via a stored callback ref.
 */
let capturedOnChange: ((v: string) => void) | undefined;

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value?: string;
    onChange?: (v: string) => void;
    options?: { readOnly?: boolean };
  }) => {
    capturedOnChange = onChange;
    return (
      <div
        data-testid="monaco-editor"
        data-value={value}
        data-readonly={String(options?.readOnly ?? false)}
      >
        <button
          type="button"
          data-testid="monaco-change-trigger"
          onClick={() => onChange?.('edited-via-mock')}
        >
          trigger-change
        </button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Props helpers
// ---------------------------------------------------------------------------

const noop = vi.fn();

function makeProps(dsl: string) {
  return {
    dsl,
    explanation: 'test explanation',
    confidence: 0.8,
    onExecute: noop,
    onSaveAsFilter: noop,
  };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function getEditToggle(): HTMLButtonElement {
  // The button is labeled "Edit" or "Cancel edit"
  return screen.getByRole('button', { name: /^(Edit|Cancel edit)$/ }) as HTMLButtonElement;
}

function getMonacoEditor(): HTMLElement {
  return screen.getByTestId('monaco-editor');
}

function currentMonacoValue(): string {
  return getMonacoEditor().getAttribute('data-value') ?? '';
}

function isReadOnly(): boolean {
  return getMonacoEditor().getAttribute('data-readonly') === 'true';
}

// ---------------------------------------------------------------------------
// Property A — re-render with new `dsl` prop resets state
// ---------------------------------------------------------------------------

describe(
  'Feature: sprint-26-nl-search, Property 13A: DslPreviewPanel resets to props.dsl when dsl prop changes',
  () => {
    afterEach(() => {
      vi.clearAllMocks();
      capturedOnChange = undefined;
    });

    test(
      'For arbitrary distinct DSL strings A and B, re-rendering with dsl=B resets editing=false and currentDsl=B',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Two distinct printable strings for dslA and dslB
            fc
              .tuple(
                fc.string({ minLength: 1, maxLength: 80 }),
                fc.string({ minLength: 1, maxLength: 80 }),
              )
              .filter(([a, b]) => a !== b),
            async ([dslA, dslB]) => {
              const { rerender, unmount } = render(<DslPreviewPanel {...makeProps(dslA)} />);

              // Wait for Suspense / React.lazy to resolve the mocked Monaco module
              await waitFor(() => {
                expect(screen.queryByTestId('monaco-editor')).not.toBeNull();
              });

              // Initial render: editing=false, value=dslA
              expect(getEditToggle().textContent).toBe('Edit');
              expect(currentMonacoValue()).toBe(dslA);
              expect(isReadOnly()).toBe(true);

              // Re-render with new dsl prop
              act(() => {
                rerender(<DslPreviewPanel {...makeProps(dslB)} />);
              });

              // After prop change: editing must be false (useEffect resets it)
              expect(
                getEditToggle().textContent,
                `After dsl prop change A→B, Edit toggle should show "Edit" (editing=false)`,
              ).toBe('Edit');

              // currentDsl must reflect the new prop
              expect(
                currentMonacoValue(),
                `After dsl prop change A→B, Monaco value should be dslB="${dslB}"`,
              ).toBe(dslB);

              // Monaco must be readOnly since editing=false
              expect(
                isReadOnly(),
                `After dsl prop change, Monaco must be readOnly (editing=false)`,
              ).toBe(true);

              unmount();
            },
          ),
          { numRuns: 100, endOnFailure: true },
        );
      },
    );

    test(
      'Re-render resets editing=false even when component was in editing mode before prop change',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc
              .tuple(
                fc.string({ minLength: 1, maxLength: 80 }),
                fc.string({ minLength: 1, maxLength: 80 }),
              )
              .filter(([a, b]) => a !== b),
            async ([dslA, dslB]) => {
              const { rerender, unmount } = render(<DslPreviewPanel {...makeProps(dslA)} />);

              // Wait for Suspense / React.lazy to resolve
              await waitFor(() => {
                expect(screen.queryByTestId('monaco-editor')).not.toBeNull();
              });

              // Enter editing mode
              act(() => {
                fireEvent.click(getEditToggle());
              });
              expect(getEditToggle().textContent).toBe('Cancel edit');
              expect(isReadOnly()).toBe(false);

              // Re-render with new dsl prop — useEffect([props.dsl]) fires
              act(() => {
                rerender(<DslPreviewPanel {...makeProps(dslB)} />);
              });

              // editing must be reset to false
              expect(
                getEditToggle().textContent,
                `After dsl prop change while editing, Edit toggle should show "Edit"`,
              ).toBe('Edit');

              expect(
                currentMonacoValue(),
                `After dsl prop change, Monaco value should be dslB="${dslB}"`,
              ).toBe(dslB);

              expect(isReadOnly()).toBe(true);

              unmount();
            },
          ),
          { numRuns: 100, endOnFailure: true },
        );
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Property B — clicking Cancel reverts currentDsl to props.dsl
// ---------------------------------------------------------------------------

describe(
  'Feature: sprint-26-nl-search, Property 13B: DslPreviewPanel Cancel reverts currentDsl to props.dsl',
  () => {
    afterEach(() => {
      vi.clearAllMocks();
      capturedOnChange = undefined;
    });

    test(
      'For arbitrary distinct DSL strings initial and edited, Cancel reverts Monaco value to initial and sets editing=false',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // initial and edited must differ so the revert is observable
            fc
              .tuple(
                fc.string({ minLength: 1, maxLength: 80 }),
                fc.string({ minLength: 1, maxLength: 80 }),
              )
              .filter(([initial, edited]) => initial !== edited),
            async ([initial, edited]) => {
              const { unmount } = render(<DslPreviewPanel {...makeProps(initial)} />);

              // Wait for Suspense / React.lazy to resolve
              await waitFor(() => {
                expect(screen.queryByTestId('monaco-editor')).not.toBeNull();
              });

              // 1. Verify initial state
              expect(getEditToggle().textContent).toBe('Edit');
              expect(currentMonacoValue()).toBe(initial);

              // 2. Click Edit → enter editing mode
              act(() => {
                fireEvent.click(getEditToggle());
              });
              expect(getEditToggle().textContent).toBe('Cancel edit');
              expect(isReadOnly()).toBe(false);

              // 3. Simulate Monaco onChange with edited value
              act(() => {
                if (capturedOnChange) {
                  capturedOnChange(edited);
                } else {
                  // Fallback: fire the mock button that calls onChange
                  const triggerBtn = screen.getByTestId('monaco-change-trigger');
                  fireEvent.click(triggerBtn);
                }
              });

              // Confirm the edited value was registered (Monaco mock reflects it)
              // Note: the mock re-renders with the new value on next render cycle
              // The important assertion is after Cancel.

              // 4. Click Cancel edit → should revert to initial
              act(() => {
                fireEvent.click(getEditToggle());
              });

              // 5. Assert editing=false (toggle label back to "Edit")
              expect(
                getEditToggle().textContent,
                `After Cancel, Edit toggle should show "Edit"`,
              ).toBe('Edit');

              // 6. Assert Monaco reflects props.dsl (initial), not the edited value
              expect(
                currentMonacoValue(),
                `After Cancel, Monaco value should revert to initial="${initial}", not edited="${edited}"`,
              ).toBe(initial);

              // 7. Monaco must be readOnly again
              expect(isReadOnly()).toBe(true);

              unmount();
            },
          ),
          { numRuns: 100, endOnFailure: true },
        );
      },
    );

    test(
      'Cancel from editing mode does not invoke onExecute or onSaveAsFilter',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 80 }),
            async (dsl) => {
              const onExecute = vi.fn();
              const onSaveAsFilter = vi.fn();

              const { unmount } = render(
                <DslPreviewPanel
                  dsl={dsl}
                  explanation=""
                  confidence={0.5}
                  onExecute={onExecute}
                  onSaveAsFilter={onSaveAsFilter}
                />,
              );

              // Wait for Suspense / React.lazy to resolve
              await waitFor(() => {
                expect(screen.queryByTestId('monaco-editor')).not.toBeNull();
              });

              // Enter editing mode then cancel
              act(() => {
                fireEvent.click(getEditToggle()); // Edit → Cancel edit
              });
              act(() => {
                fireEvent.click(getEditToggle()); // Cancel edit → Edit
              });

              expect(onExecute).not.toHaveBeenCalled();
              expect(onSaveAsFilter).not.toHaveBeenCalled();

              unmount();
            },
          ),
          { numRuns: 50, endOnFailure: true },
        );
      },
    );
  },
);
