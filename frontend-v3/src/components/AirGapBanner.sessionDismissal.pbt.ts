/**
 * Property-based test — AirGapBanner Session Dismissal
 *
 * Feature: sprint-31-airgap
 * Property 3: Banner Session Dismissal
 *
 * For any render sequence with airGapMode=true, exactly one dismiss click hides
 * the banner, a subsequent unmount+remount restores it visible, and a
 * vi.spyOn(Storage.prototype, 'setItem') spy records zero invocations across
 * the whole run.
 *
 * **Validates: Requirements 11.11, 11.12, 11.13**
 */

import React from 'react';

import { fc, test } from '@fast-check/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, vi, type MockInstance } from 'vitest';

import { AirGapBanner } from './AirGapBanner';
import { useSystemInfoStore } from '../store/systemInfoStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure the store with airGapMode=true and all required fields populated.
 */
function setAirGapActive(appName: string, version: string): void {
  useSystemInfoStore.setState({
    appName,
    version,
    airGapMode: true,
    osVersion: 'Linux 6.1',
    javaVersion: '17.0.11',
    isLoaded: true,
  });
}

/**
 * Reset the store to its initial state (airGapMode=false, isLoaded=false).
 */
function resetStore(): void {
  useSystemInfoStore.setState({
    appName: null,
    version: null,
    airGapMode: false,
    osVersion: null,
    javaVersion: null,
    isLoaded: false,
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary non-empty app name string (printable, no control chars). */
const arbAppName = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary semver-like version string. */
const arbVersion = fc
  .tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// ---------------------------------------------------------------------------
// Property 3 — Banner Session Dismissal
// ---------------------------------------------------------------------------

describe('AirGapBanner — Property 3: Banner Session Dismissal', () => {
  let setItemSpy: MockInstance;

  beforeEach(() => {
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    cleanup();
    resetStore();
    setItemSpy.mockRestore();
  });

  test.prop(
    [arbAppName, arbVersion],
    { numRuns: 100, endOnFailure: true },
  )(
    'dismiss hides banner, remount restores it, no localStorage.setItem called',
    async (appName, version) => {
      const user = userEvent.setup();

      // --- Phase 1: Initial render — banner must be visible ---
      setAirGapActive(appName, version);
      const { unmount } = render(React.createElement(AirGapBanner));

      const alertElement = screen.queryByRole('alert');
      if (!alertElement) {
        throw new Error(
          `Banner should be visible on initial render with airGapMode=true. appName=${JSON.stringify(appName)}, version=${version}`,
        );
      }

      // --- Phase 2: Dismiss click — banner must hide ---
      const dismissButton = screen.getByLabelText('Dismiss air-gap notice');
      await user.click(dismissButton);

      const alertAfterDismiss = screen.queryByRole('alert');
      if (alertAfterDismiss) {
        throw new Error(
          `Banner should be hidden after dismiss click. appName=${JSON.stringify(appName)}, version=${version}`,
        );
      }

      // --- Phase 3: Unmount + remount — banner must reappear ---
      unmount();

      // Re-render a fresh instance (simulates component remount after navigation)
      render(React.createElement(AirGapBanner));

      const alertAfterRemount = screen.queryByRole('alert');
      if (!alertAfterRemount) {
        throw new Error(
          `Banner should be visible again after unmount+remount (session-only dismissal). appName=${JSON.stringify(appName)}, version=${version}`,
        );
      }

      // --- Invariant: No localStorage.setItem calls across the entire run ---
      if (setItemSpy.mock.calls.length !== 0) {
        throw new Error(
          `localStorage.setItem was called ${setItemSpy.mock.calls.length} time(s) during render/dismiss/remount cycle. ` +
          `Calls: ${JSON.stringify(setItemSpy.mock.calls)}. ` +
          `appName=${JSON.stringify(appName)}, version=${version}`,
        );
      }

      // Cleanup for next iteration
      cleanup();
    },
  );
});
