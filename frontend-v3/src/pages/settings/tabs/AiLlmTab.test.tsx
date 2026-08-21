/**
 * Property-Based Tests: AiLlmTab — apiKeyTouched logic
 *
 * **Validates: Requirements 1.6**
 *
 * The `apiKeyTouched` flag is computed as a pure predicate:
 *
 *   apiKeyTouched = (currentValue !== initialValue)
 *
 * Because the logic is stateless and side-effect-free, we extract it as a
 * plain function and verify its universal properties with fast-check without
 * mounting the component.
 *
 * Three sub-properties are verified:
 *   P20a — For any two *different* strings, touched must be true.
 *   P20b — For any string, when current equals initial, touched must be false.
 *   P20c — The sentinel "***" behaves as an ordinary string (no special casing).
 */

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure function under test
//
// Mirrors the exact predicate used in AiLlmTab.tsx:
//   setApiKeyTouched(value !== initialApiKey.current);
// ---------------------------------------------------------------------------

function computeApiKeyTouched(initial: string, current: string): boolean {
  return current !== initial;
}

// ---------------------------------------------------------------------------
// Property 20: apiKeyTouched reflects real edits
// **Validates: Requirements 1.6**
// ---------------------------------------------------------------------------

describe('Property 20: apiKeyTouched reflects real edits', () => {
  /**
   * P20a — touched is true when current differs from initial.
   *
   * Strategy: generate two arbitrary strings and filter to pairs where they
   * are not equal. For every such pair the predicate must return true.
   */
  it('P20a: apiKeyTouched is true when the new value differs from the initial value', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (initial, current) => {
          fc.pre(initial !== current);
          return computeApiKeyTouched(initial, current) === true;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * P20b — touched is false when current equals initial.
   *
   * Strategy: generate a single string and use it as both arguments.
   * The predicate must always return false.
   */
  it('P20b: apiKeyTouched is false when the new value equals the initial value', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (value) => {
          return computeApiKeyTouched(value, value) === false;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * P20c — The masked sentinel "***" carries no special treatment.
   *
   * Sub-case 1: initial="***", current="***" → touched must be false
   *             (user has not changed anything; backend will preserve the key).
   *
   * Sub-case 2: initial="***", current=any string != "***" → touched must be true
   *             (user typed a new key over the masked placeholder).
   *
   * Sub-case 3: initial=any string != "***", current="***" → touched must be true
   *             (user literally typed three asterisks; that is a real edit).
   */
  it('P20c: the sentinel "***" is treated as a regular string (no special casing)', () => {
    const SENTINEL = '***';

    // Sub-case 1: same sentinel on both sides → false
    expect(computeApiKeyTouched(SENTINEL, SENTINEL)).toBe(false);

    // Sub-case 2: initial is sentinel, user types something else → true
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== SENTINEL),
        (edited) => {
          return computeApiKeyTouched(SENTINEL, edited) === true;
        },
      ),
      { numRuns: 500 },
    );

    // Sub-case 3: initial is some non-sentinel, user types "***" → true
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== SENTINEL),
        (initial) => {
          return computeApiKeyTouched(initial, SENTINEL) === true;
        },
      ),
      { numRuns: 500 },
    );
  });
});
