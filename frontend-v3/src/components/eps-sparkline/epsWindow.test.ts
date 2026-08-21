/**
 * epsWindow.test.ts — Unit tests for the EPS sliding-window helper.
 *
 * Covers:
 *   - emptyWindow initial state
 *   - pushEpsSample with valid values
 *   - Sanitization of non-finite and negative inputs
 *   - Sliding-window trimming when EPS_WINDOW_SIZE is exceeded
 *   - Immutability of the input window
 *
 * Requirements: 10.2, 10.3
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  EPS_WINDOW_SIZE,
  emptyWindow,
  pushEpsSample,
} from './epsWindow';

// ---------------------------------------------------------------------------
// emptyWindow
// ---------------------------------------------------------------------------

describe('emptyWindow', () => {
  it('starts with zero samples', () => {
    expect(emptyWindow.samples).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pushEpsSample — basic push behavior
// ---------------------------------------------------------------------------

describe('pushEpsSample — basic behavior', () => {
  it('appends a valid positive sample', () => {
    const w = pushEpsSample(emptyWindow, 42);
    expect(w.samples).toEqual([42]);
  });

  it('appends zero', () => {
    const w = pushEpsSample(emptyWindow, 0);
    expect(w.samples).toEqual([0]);
  });

  it('the last element always equals the sanitized sample', () => {
    const w1 = pushEpsSample(emptyWindow, 10);
    const w2 = pushEpsSample(w1, 20);
    expect(w2.samples[w2.samples.length - 1]).toBe(20);
  });

  it('does not mutate the input window', () => {
    const original = emptyWindow;
    pushEpsSample(original, 99);
    expect(original.samples).toHaveLength(0);
  });

  it('accumulates up to EPS_WINDOW_SIZE samples without dropping', () => {
    let win = emptyWindow;
    for (let i = 0; i < EPS_WINDOW_SIZE; i++) {
      win = pushEpsSample(win, i);
    }
    expect(win.samples).toHaveLength(EPS_WINDOW_SIZE);
    expect(win.samples[EPS_WINDOW_SIZE - 1]).toBe(EPS_WINDOW_SIZE - 1);
  });
});

// ---------------------------------------------------------------------------
// pushEpsSample — sanitization of bad inputs
// ---------------------------------------------------------------------------

describe('pushEpsSample — sanitization', () => {
  it('sanitizes NaN to 0', () => {
    const w = pushEpsSample(emptyWindow, NaN);
    expect(w.samples).toEqual([0]);
  });

  it('sanitizes +Infinity to 0', () => {
    const w = pushEpsSample(emptyWindow, Infinity);
    expect(w.samples).toEqual([0]);
  });

  it('sanitizes -Infinity to 0', () => {
    const w = pushEpsSample(emptyWindow, -Infinity);
    expect(w.samples).toEqual([0]);
  });

  it('sanitizes negative numbers to 0', () => {
    const w = pushEpsSample(emptyWindow, -5);
    expect(w.samples).toEqual([0]);
  });

  it('sanitizes -0 as a valid 0 (passes through since -0 is finite and -0 >= 0)', () => {
    // -0 is finite and -0 >= 0 is true in JS, so -0 passes sanitization unchanged.
    // We verify it is stored and is non-negative (i.e. not strictly negative).
    const w = pushEpsSample(emptyWindow, -0);
    expect(w.samples).toHaveLength(1);
    expect(w.samples[0] >= 0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pushEpsSample — sliding-window trimming
// ---------------------------------------------------------------------------

describe('pushEpsSample — window bounds', () => {
  it('trims the oldest sample when length exceeds EPS_WINDOW_SIZE', () => {
    let win = emptyWindow;
    // Fill to exactly EPS_WINDOW_SIZE
    for (let i = 0; i < EPS_WINDOW_SIZE; i++) {
      win = pushEpsSample(win, i);
    }
    // One more push should drop sample 0
    const overflowed = pushEpsSample(win, 999);
    expect(overflowed.samples).toHaveLength(EPS_WINDOW_SIZE);
    expect(overflowed.samples[0]).toBe(1);
    expect(overflowed.samples[EPS_WINDOW_SIZE - 1]).toBe(999);
  });

  it('length never exceeds EPS_WINDOW_SIZE after many pushes', () => {
    let win = emptyWindow;
    for (let i = 0; i < EPS_WINDOW_SIZE * 3; i++) {
      win = pushEpsSample(win, i);
      expect(win.samples.length).toBeLessThanOrEqual(EPS_WINDOW_SIZE);
    }
  });

  it('preserves the correct sliding window ordering', () => {
    let win = emptyWindow;
    // Push values 0..EPS_WINDOW_SIZE+4 (5 overflow pushes)
    for (let i = 0; i <= EPS_WINDOW_SIZE + 4; i++) {
      win = pushEpsSample(win, i);
    }
    // The window should contain the last EPS_WINDOW_SIZE values
    const expected = Array.from(
      { length: EPS_WINDOW_SIZE },
      (_, k) => k + 5
    );
    expect(Array.from(win.samples)).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Property 16: EPS sparkline window bounds (fast-check)
//
// Validates: Requirements 10.2, 10.3
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 10.2, 10.3**
 *
 * Property 16: EPS sparkline window bounds.
 *
 * Generates arbitrary sequences of pushes with arbitrary sample values and
 * verifies the three invariants hold after every push:
 *   1. 0 ≤ samples.length ≤ EPS_WINDOW_SIZE
 *   2. ∀ s ∈ samples: s >= 0
 *   3. After pushEpsSample(win, x) the last element equals the sanitized x
 */
describe('Property 16: EPS sparkline window bounds (fast-check)', () => {
  it('P16a: length invariant: 0 ≤ samples.length ≤ EPS_WINDOW_SIZE after every push', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ noNaN: false }), { minLength: 0, maxLength: 200 }),
        (samples) => {
          let win = emptyWindow;
          for (const s of samples) {
            win = pushEpsSample(win, s);
            expect(win.samples.length).toBeGreaterThanOrEqual(0);
            expect(win.samples.length).toBeLessThanOrEqual(EPS_WINDOW_SIZE);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('P16b: non-negativity: ∀ s ∈ samples: s >= 0 after every push', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ noNaN: false }), { minLength: 1, maxLength: 200 }),
        (samples) => {
          let win = emptyWindow;
          for (const s of samples) {
            win = pushEpsSample(win, s);
            for (const stored of win.samples) {
              expect(stored).toBeGreaterThanOrEqual(0);
            }
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('P16c: last element equals sanitized input after each push', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: false }),
        (sample) => {
          const win = pushEpsSample(emptyWindow, sample);
          // Sanitized value: non-finite or negative → 0, otherwise the sample itself
          const sanitized = Number.isFinite(sample) && sample >= 0 ? sample : 0;
          expect(win.samples[win.samples.length - 1]).toBe(sanitized);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
