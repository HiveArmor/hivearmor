/**
 * epsWindow.ts — Pure helper for the rolling EPS (events-per-second) sample window.
 *
 * Maintains a bounded sliding window of up to EPS_WINDOW_SIZE samples.
 * At a 30-second refetch cadence this covers 30 minutes of history.
 *
 * Invariants enforced on every push:
 *   - 0 ≤ samples.length ≤ EPS_WINDOW_SIZE
 *   - ∀ s ∈ samples: s ≥ 0  (non-finite or negative inputs are sanitized to 0)
 *   - The last element always equals the sanitized version of the pushed sample
 *
 * Requirements: 10.2, 10.3
 */

/** Maximum number of samples retained in the window (30 min at 30 s cadence). */
export const EPS_WINDOW_SIZE = 60;

/** An immutable rolling window of EPS samples. */
export interface EpsWindow {
  readonly samples: readonly number[];
}

/** The canonical empty window — use as the initial state. */
export const emptyWindow: EpsWindow = { samples: [] };

/**
 * Append a new EPS sample to the window, returning a new window.
 *
 * - Non-finite values (NaN, ±Infinity) are sanitized to 0.
 * - Negative values are sanitized to 0.
 * - When the window would exceed EPS_WINDOW_SIZE the oldest sample is dropped.
 *
 * @param win    The current window (never mutated).
 * @param sample The new raw EPS reading from the server.
 * @returns      A new EpsWindow with the sample appended (and possibly trimmed).
 */
export function pushEpsSample(win: EpsWindow, sample: number): EpsWindow {
  const clean = Number.isFinite(sample) && sample >= 0 ? sample : 0;
  const next = [...win.samples, clean];
  return {
    samples:
      next.length > EPS_WINDOW_SIZE
        ? next.slice(next.length - EPS_WINDOW_SIZE)
        : next,
  };
}
