/**
 * Property-based test for DslPreviewPanel — save confirmation timeout invariant.
 *
 * Feature: sprint-26-nl-search
 * **Property 12: `DslPreviewPanel` save confirmation reverts after exactly 2000ms**
 * **Validates: Requirements 11.3, 11.4, 11.5**
 *
 * Five properties are verified using Vitest fake timers + fast-check arbitraries:
 *
 *   Property A — label while saving:
 *     After clicking "Save as filter", the button label is "Saved ✓" at t=0
 *     through t<2000 ms (verified at t=0 and t=1999).
 *
 *   Property B — label after timeout:
 *     At t=2000 the button label reverts to "Save as filter".
 *
 *   Property C — disabled while saving:
 *     The button is `disabled` while the label is "Saved ✓".
 *
 *   Property D — additional clicks don't re-invoke:
 *     While the button is disabled, additional click attempts do not call
 *     `props.onSaveAsFilter` again (exactly one call total per save action).
 *
 *   Property E — unmount before 2000ms:
 *     Unmounting the component before the timer fires does NOT cause a
 *     post-unmount state update (no React "Can't perform a state update on
 *     unmounted component" warning).
 *
 * Minimum iterations: 50
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { DslPreviewPanel } from '../DslPreviewPanel';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Monaco editor is lazily loaded via React.lazy. Mock it so tests resolve
 * synchronously without a real editor bundle.
 */
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_DSL = '{"query":{"match_all":{}}}';
const FIXED_EXPLANATION = 'All events';
const FIXED_CONFIDENCE = 0.85;

/** Queries for the save/saved button regardless of current label. */
function getSaveButton(): HTMLElement {
  // It alternates between "Save as filter" and "Saved ✓" — grab by type/class
  const btn = screen.queryByRole('button', { name: /save as filter/i })
    ?? screen.queryByRole('button', { name: /saved/i });
  if (!btn) throw new Error('Save button not found in DOM');
  return btn;
}

/** Returns the current text content of the save button. */
function getSaveButtonLabel(): string {
  return getSaveButton().textContent?.trim() ?? '';
}

/** Returns whether the save button is disabled. */
function isSaveButtonDisabled(): boolean {
  return (getSaveButton() as HTMLButtonElement).disabled;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Feature: sprint-26-nl-search, Property 12: save confirmation reverts after 2000ms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property A+B+C: label and disabled state across time
  // -------------------------------------------------------------------------

  test(
    'Property A+B+C: label is "Saved ✓" at t=0..1999, reverts at t=2000; button is disabled while "Saved ✓"',
    () => {
      fc.assert(
        fc.property(
          // Arbitrary DSL string to pass as props (tests the component doesn't
          // hard-code any specific DSL for the confirmation behaviour).
          fc.string({ minLength: 1, maxLength: 80 }),
          // Arbitrary explanation string
          fc.string({ minLength: 0, maxLength: 40 }),
          // Arbitrary confidence value in [0, 1]
          fc.double({ min: 0, max: 1, noNaN: true }),
          (dsl, explanation, confidence) => {
            const onExecute = vi.fn();
            const onSaveAsFilter = vi.fn();

            const { unmount } = render(
              <DslPreviewPanel
                dsl={dsl}
                explanation={explanation}
                confidence={confidence}
                onExecute={onExecute}
                onSaveAsFilter={onSaveAsFilter}
              />,
            );

            // --- Before click: label is "Save as filter", enabled ---
            expect(getSaveButtonLabel()).toBe('Save as filter');
            expect(isSaveButtonDisabled()).toBe(false);

            // --- Click the button ---
            act(() => {
              fireEvent.click(getSaveButton());
            });

            // Property A: At t=0, label is "Saved ✓" and button is disabled
            expect(getSaveButtonLabel()).toBe('Saved ✓');
            expect(isSaveButtonDisabled()).toBe(true);

            // Property A: Advance to t=1999 — still "Saved ✓" and disabled
            act(() => {
              vi.advanceTimersByTime(1999);
            });
            expect(getSaveButtonLabel()).toBe('Saved ✓');
            expect(isSaveButtonDisabled()).toBe(true);

            // Property B+C: Advance 1 more ms (total = 2000) — label reverts
            act(() => {
              vi.advanceTimersByTime(1);
            });
            expect(getSaveButtonLabel()).toBe('Save as filter');
            expect(isSaveButtonDisabled()).toBe(false);

            unmount();
          },
        ),
        { numRuns: 50, endOnFailure: true },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property D: Additional clicks while disabled don't re-invoke callback
  // -------------------------------------------------------------------------

  test(
    'Property D: Clicks on disabled button do not re-invoke props.onSaveAsFilter',
    () => {
      fc.assert(
        fc.property(
          // Number of additional clicks to attempt while button is disabled (1..5)
          fc.integer({ min: 1, max: 5 }),
          // Time offset between extra clicks in ms (0..500 each, staying well under 2000)
          fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 5 }),
          (extraClicks, timeOffsets) => {
            const onExecute = vi.fn();
            const onSaveAsFilter = vi.fn();

            const { unmount } = render(
              <DslPreviewPanel
                dsl={FIXED_DSL}
                explanation={FIXED_EXPLANATION}
                confidence={FIXED_CONFIDENCE}
                onExecute={onExecute}
                onSaveAsFilter={onSaveAsFilter}
              />,
            );

            // First legitimate click
            act(() => {
              fireEvent.click(getSaveButton());
            });

            expect(onSaveAsFilter).toHaveBeenCalledTimes(1);

            // Attempt extra clicks while button is in "Saved ✓" / disabled state.
            // Advance time a little between clicks, but keep total < 2000 ms.
            let elapsed = 0;
            for (let i = 0; i < extraClicks; i++) {
              const offset = timeOffsets[i % timeOffsets.length];
              // Clamp so we never reach 2000 during extra-click phase
              const safeOffset = Math.min(offset, Math.floor((1990 - elapsed) / (extraClicks - i)));
              if (safeOffset > 0) {
                act(() => {
                  vi.advanceTimersByTime(safeOffset);
                });
                elapsed += safeOffset;
              }

              // The button should still be disabled; clicks should be no-ops
              expect(isSaveButtonDisabled()).toBe(true);
              act(() => {
                fireEvent.click(getSaveButton());
              });
            }

            // Callback must still have been called exactly once
            expect(onSaveAsFilter).toHaveBeenCalledTimes(1);

            // Advance past 2000 to clean up the timer
            act(() => {
              vi.advanceTimersByTime(2000);
            });

            unmount();
          },
        ),
        { numRuns: 50, endOnFailure: true },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Property E: Unmount before 2000ms — no post-unmount state update warning
  // -------------------------------------------------------------------------

  test(
    'Property E: Unmounting before 2000ms does not cause post-unmount state update warning',
    () => {
      fc.assert(
        fc.property(
          // Time elapsed before unmounting (1..1999 ms — always before the timeout)
          fc.integer({ min: 1, max: 1999 }),
          (msBeforeUnmount) => {
            const consoleErrorSpy = vi.spyOn(console, 'error');

            const onExecute = vi.fn();
            const onSaveAsFilter = vi.fn();

            const { unmount } = render(
              <DslPreviewPanel
                dsl={FIXED_DSL}
                explanation={FIXED_EXPLANATION}
                confidence={FIXED_CONFIDENCE}
                onExecute={onExecute}
                onSaveAsFilter={onSaveAsFilter}
              />,
            );

            // Click save to start the 2000ms countdown
            act(() => {
              fireEvent.click(getSaveButton());
            });

            expect(getSaveButtonLabel()).toBe('Saved ✓');

            // Advance timer partway (still before 2000ms)
            act(() => {
              vi.advanceTimersByTime(msBeforeUnmount);
            });

            // Unmount before the timeout fires
            act(() => {
              unmount();
            });

            // Fire the remaining time — the cleanup ref in the useEffect should
            // have cleared the setTimeout, so no state update occurs.
            act(() => {
              vi.advanceTimersByTime(2000 - msBeforeUnmount + 100);
            });

            // Assert no React "Can't perform a state update on unmounted component"
            // warning was logged (React 18 removed this warning, but other errors
            // from bad timer usage are still surfaced).
            const reactErrors = consoleErrorSpy.mock.calls.filter(([msg]) =>
              typeof msg === 'string' &&
              (msg.includes('unmounted component') ||
               msg.includes('memory leak') ||
               msg.includes('Warning:')),
            );
            expect(reactErrors).toHaveLength(0);

            consoleErrorSpy.mockRestore();
          },
        ),
        { numRuns: 50, endOnFailure: true },
      );
    },
  );
});
