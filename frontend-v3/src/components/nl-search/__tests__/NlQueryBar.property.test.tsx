/**
 * Property-based test for NlQueryBar — single input modality invariant.
 *
 * Feature: sprint-26-nl-search
 * **Property 10: `NlQueryBar` renders exactly one input modality at a time**
 * **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7**
 *
 * Two properties are verified:
 *
 *   Property A — initial render shows exactly one modality:
 *     For arbitrary `initialMode` values (`'nl'` | `'dsl'` | `undefined`):
 *     - When mode resolves to 'nl': the NL input is present, Monaco editor is
 *       NOT present, and the Translate button IS present.
 *     - When mode resolves to 'dsl': the Monaco editor container is present,
 *       the NL input is NOT present, and the Translate button is NOT present.
 *
 *   Property B — toggle sequences maintain the single-modality invariant:
 *     For arbitrary toggle sequences (0–5 clicks of the mode-toggle button):
 *     - At every step, exactly one of the NL input OR Monaco wrapper is in
 *       the DOM (never both, never neither).
 *     - The Translate button is present iff current mode is 'nl'.
 *     - The Translate button is disabled iff the NL input is blank.
 *
 * Minimum iterations: 100
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { describe, test, expect, vi, afterEach } from 'vitest';

import { NlQueryBar } from '../NlQueryBar';

import type { NlToDslResponse } from '@/types/search.types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Monaco editor is lazily loaded via React.lazy. Mock it so tests do not
 * need a real editor bundle and so Suspense resolves synchronously.
 */
vi.mock('@monaco-editor/react', () => ({
  default: ({ onChange }: { onChange?: (v: string) => void }) => (
    <div data-testid="monaco-editor" onChange={() => onChange?.('')} />
  ),
}));

/**
 * translateNlToDsl is called when the Translate button is clicked. Mock it
 * so tests do not make real HTTP calls.
 */
vi.mock('@/services/searchService', () => ({
  translateNlToDsl: vi
    .fn()
    .mockResolvedValue({
      dsl: '{}',
      explanation: '',
      confidence: 0.75,
    } satisfies NlToDslResponse),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_INDEX_PATTERN = 'v3-hive-alert-*';
const FIXED_ON_TRANSLATE = vi.fn();

function queryNlInput(): HTMLElement | null {
  return screen.queryByRole('textbox', {
    name: /natural language search query/i,
  });
}

function queryMonacoEditor(): HTMLElement | null {
  return screen.queryByTestId('monaco-editor');
}

function queryTranslateButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: /translate/i });
}

function getModeToggleButton(): HTMLElement {
  return screen.getByRole('button', { name: /switch to (dsl|natural language) mode/i });
}

/**
 * Assert the single-modality invariant for the current DOM snapshot.
 * Exactly one of nlInput or monacoEditor must be present.
 */
function assertSingleModality(label: string): void {
  const nlInputPresent = queryNlInput() !== null;
  const monacoPresent = queryMonacoEditor() !== null;

  expect(
    nlInputPresent || monacoPresent,
    `[${label}] Neither NL input nor Monaco editor found in DOM`,
  ).toBe(true);

  expect(
    nlInputPresent && monacoPresent,
    `[${label}] Both NL input AND Monaco editor found in DOM (invariant violated)`,
  ).toBe(false);
}

/**
 * Assert Translate button presence/absence based on inferred current mode.
 * Returns the inferred mode.
 */
function assertTranslateButtonConsistency(label: string): 'nl' | 'dsl' {
  const nlInputPresent = queryNlInput() !== null;
  const translateButton = queryTranslateButton();

  if (nlInputPresent) {
    expect(
      translateButton,
      `[${label}] mode=nl: Translate button must be present`,
    ).not.toBeNull();
    return 'nl';
  } else {
    expect(
      translateButton,
      `[${label}] mode=dsl: Translate button must be absent`,
    ).toBeNull();
    return 'dsl';
  }
}

/**
 * Assert Translate button disabled state: disabled iff NL input is blank.
 */
function assertTranslateButtonDisabledState(
  label: string,
  nlInputValue: string,
): void {
  const translateButton = queryTranslateButton();
  if (translateButton === null) return; // DSL mode — irrelevant

  const isBlank = nlInputValue.trim() === '';
  expect(
    (translateButton as HTMLButtonElement).disabled,
    `[${label}] Translate disabled=${isBlank} expected for value="${nlInputValue}"`,
  ).toBe(isBlank);
}

// ---------------------------------------------------------------------------
// Property A — initial render shows exactly one modality
// ---------------------------------------------------------------------------

describe(
  'Feature: sprint-26-nl-search, Property 10A: NlQueryBar initial render shows exactly one input modality',
  () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    test(
      'For arbitrary initialMode, exactly one modality is rendered and Translate button is present iff mode is nl',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.oneof(
              fc.constant('nl' as const),
              fc.constant('dsl' as const),
              fc.constant(undefined),
            ),
            async (initialMode) => {
              const { unmount } = render(
                <NlQueryBar
                  indexPattern={FIXED_INDEX_PATTERN}
                  initialMode={initialMode}
                  onTranslate={FIXED_ON_TRANSLATE}
                />,
              );

              const resolvedMode = initialMode ?? 'nl';
              const label = `initialMode=${String(initialMode)}`;

              // Wait for Suspense / React.lazy to resolve the mocked Monaco module
              if (resolvedMode === 'dsl') {
                await waitFor(() => {
                  expect(queryMonacoEditor()).not.toBeNull();
                });
              }

              // Core invariant: exactly one modality present
              assertSingleModality(label);

              const translateButton = queryTranslateButton();
              if (resolvedMode === 'nl') {
                expect(
                  translateButton,
                  `[${label}] Translate button must be present in nl mode`,
                ).not.toBeNull();
                expect(
                  queryNlInput(),
                  `[${label}] NL input must be present in nl mode`,
                ).not.toBeNull();
                expect(
                  queryMonacoEditor(),
                  `[${label}] Monaco editor must be absent in nl mode`,
                ).toBeNull();
                // Translate button disabled because input is blank on initial render
                expect(
                  (translateButton as HTMLButtonElement).disabled,
                  `[${label}] Translate button must be disabled when input is blank`,
                ).toBe(true);
              } else {
                // dsl mode
                expect(
                  translateButton,
                  `[${label}] Translate button must be absent in dsl mode`,
                ).toBeNull();
                expect(
                  queryMonacoEditor(),
                  `[${label}] Monaco editor must be present in dsl mode`,
                ).not.toBeNull();
                expect(
                  queryNlInput(),
                  `[${label}] NL input must be absent in dsl mode`,
                ).toBeNull();
              }

              unmount();
            },
          ),
          { numRuns: 50, endOnFailure: true },
        );
      },
    );
  },
);

// ---------------------------------------------------------------------------
// Property B — toggle sequences maintain single-modality invariant
// ---------------------------------------------------------------------------

describe(
  'Feature: sprint-26-nl-search, Property 10B: NlQueryBar toggle sequences maintain single-modality invariant',
  () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    test(
      'For arbitrary toggle sequences (0-5 clicks), exactly one modality present at every step; Translate iff nl; Translate disabled iff blank',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // How many times to click the mode toggle (0..5)
            fc.integer({ min: 0, max: 5 }),
            // An optional NL input value to type before toggling (tests disabled state)
            fc.oneof(
              fc.constant(''),
              fc.constant('failed logins last hour'),
              fc.string({ minLength: 1, maxLength: 50 }),
            ),
            async (toggleCount, nlText) => {
              const { unmount } = render(
                <NlQueryBar
                  indexPattern={FIXED_INDEX_PATTERN}
                  initialMode="nl"
                  onTranslate={FIXED_ON_TRANSLATE}
                />,
              );

              // Type into NL input (initial mode is 'nl', no lazy resolving needed)
              if (nlText !== '') {
                const initialNlInput = queryNlInput();
                if (initialNlInput) {
                  act(() => {
                    fireEvent.change(initialNlInput, { target: { value: nlText } });
                  });
                }
              }

              // Track expected mode: starts at 'nl'
              let expectedMode: 'nl' | 'dsl' = 'nl';

              // Verify invariants before any toggles
              {
                const step = 'before-toggles';
                assertSingleModality(step);
                assertTranslateButtonConsistency(step);
                const currentInput = queryNlInput() as HTMLInputElement | null;
                assertTranslateButtonDisabledState(step, currentInput?.value ?? '');
              }

              // Perform toggle sequence, asserting invariants after each click
              for (let i = 0; i < toggleCount; i++) {
                act(() => {
                  fireEvent.click(getModeToggleButton());
                });

                expectedMode = expectedMode === 'nl' ? 'dsl' : 'nl';
                const step = `after-toggle-${i + 1}`;

                // If switching to dsl, wait for Suspense to resolve the Monaco mock
                if (expectedMode === 'dsl') {
                  await waitFor(() => {
                    expect(queryMonacoEditor()).not.toBeNull();
                  });
                }

                assertSingleModality(step);

                const inferredMode = assertTranslateButtonConsistency(step);
                expect(
                  inferredMode,
                  `[${step}] Inferred mode should match expected mode`,
                ).toBe(expectedMode);

                if (expectedMode === 'nl') {
                  const currentNlInput = queryNlInput() as HTMLInputElement | null;
                  assertTranslateButtonDisabledState(step, currentNlInput?.value ?? '');
                }
              }

              unmount();
            },
          ),
          { numRuns: 100, endOnFailure: true },
        );
      },
    );
  },
);
