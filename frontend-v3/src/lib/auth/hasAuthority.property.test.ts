/**
 * Property-based tests for `hasAuthority`
 *
 * Feature: sprint-23-mssp-portal
 * Property 1: hasAuthority is a total, deterministic predicate of (localStorage JWT, authority)
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

import { fc, test } from "@fast-check/vitest";
import { afterEach, describe, vi } from "vitest";

import { hasAuthority } from "./hasAuthority";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a syntactically valid JWT whose payload carries `{ auth: authClaim }`.
 * Header and signature are inert stubs — `hasAuthority` never verifies them.
 */
function makeJwt(authClaim: unknown): string {
  const payload = JSON.stringify({ auth: authClaim });
  const b64 = btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `h.${b64}.s`;
}

/**
 * Stub window.localStorage so that `getItem("hivearmor_auth_token")` returns
 * the given value for the duration of the current test iteration.
 */
function setToken(value: string | null): void {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn().mockReturnValue(value),
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * An authority string that contains no comma — matches what a caller would
 * pass to `hasAuthority(authority)`.
 */
const arbAuthority = fc.string().filter((s) => !s.includes(","));

/**
 * An array of authority strings (no commas in any element), joined to produce
 * a valid comma-separated `auth` claim value.
 */
const arbAuthList = fc
  .array(fc.string().filter((s) => s.length > 0 && !s.includes(",")), {
    minLength: 0,
    maxLength: 10,
  })
  .map((arr) => arr.join(","));

// ---------------------------------------------------------------------------
// Property 1 — three sub-properties bundled into one describe block
// ---------------------------------------------------------------------------

describe(
  "hasAuthority — Property 1: total, deterministic predicate of (localStorage JWT, authority)",
  () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // Sub-property 1a: hasAuthority never throws and always returns a boolean
    // for an arbitrary localStorage string (including empty, non-base64, etc.)
    test.prop(
      [fc.string(), arbAuthority],
      {
        numRuns: 100,
        endOnFailure: true,
      },
    )(
      "returns a boolean (never throws) for any arbitrary localStorage value",
      (tokenValue, authority) => {
        setToken(tokenValue);
        let result: boolean;
        // Must never throw
        try {
          result = hasAuthority(authority);
        } catch {
          throw new Error(
            `hasAuthority threw an exception for token=${JSON.stringify(tokenValue)}, authority=${JSON.stringify(authority)}`,
          );
        }
        // Result must be a boolean
        if (typeof result !== "boolean") {
          throw new Error(
            `hasAuthority returned ${typeof result} instead of boolean`,
          );
        }
      },
    );

    // Sub-property 1b: determinism — two consecutive calls with the same
    // (tokenValue, authority) return the same value
    test.prop(
      [fc.string(), arbAuthority],
      {
        numRuns: 100,
        endOnFailure: true,
      },
    )(
      "returns the same value on two consecutive calls (deterministic)",
      (tokenValue, authority) => {
        setToken(tokenValue);
        const result1 = hasAuthority(authority);
        // Re-stub with same value to simulate same localStorage state
        setToken(tokenValue);
        const result2 = hasAuthority(authority);
        if (result1 !== result2) {
          throw new Error(
            `hasAuthority is not deterministic: first=${result1}, second=${result2} for token=${JSON.stringify(tokenValue)}, authority=${JSON.stringify(authority)}`,
          );
        }
      },
    );

    // Sub-property 1c: returns true iff the decoded `auth` claim is a string
    // whose comma-split segments contain an element strictly equal to `authority`
    test.prop(
      [arbAuthList, arbAuthority],
      {
        numRuns: 100,
        endOnFailure: true,
      },
    )(
      "returns true iff decoded auth claim comma-segments include authority (strict equality)",
      (authClaim, authority) => {
        const token = makeJwt(authClaim);
        setToken(token);

        const result = hasAuthority(authority);

        // The claim is a non-empty comma-separated list; we expect true iff
        // one segment equals the authority exactly.
        const segments = authClaim.split(",");
        const expected = segments.some((entry) => entry === authority);

        if (result !== expected) {
          throw new Error(
            `hasAuthority(${JSON.stringify(authority)}) = ${result}, expected ${expected}. authClaim=${JSON.stringify(authClaim)}`,
          );
        }
      },
    );

    // Sub-property 1d: returns false when localStorage is null (no key)
    test.prop(
      [arbAuthority],
      { numRuns: 100, endOnFailure: true },
    )(
      "returns false when localStorage returns null for the token key",
      (authority) => {
        setToken(null);
        const result = hasAuthority(authority);
        if (result !== false) {
          throw new Error(
            `hasAuthority should return false when token is null, got ${result} for authority=${JSON.stringify(authority)}`,
          );
        }
      },
    );

    // Sub-property 1e: returns false when stored JWT has a non-string auth claim
    test.prop(
      [
        fc.oneof(
          fc.integer(),
          fc.double(),
          fc.boolean(),
          fc.array(fc.string()),
          fc.record({ nested: fc.string() }),
          fc.constant(null),
        ),
        arbAuthority,
      ],
      { numRuns: 100, endOnFailure: true },
    )(
      "returns false when the auth claim is not a string",
      (nonStringAuth, authority) => {
        const token = makeJwt(nonStringAuth);
        setToken(token);
        const result = hasAuthority(authority);
        if (result !== false) {
          throw new Error(
            `hasAuthority should return false for non-string auth claim, got ${result}. authClaim=${JSON.stringify(nonStringAuth)}, authority=${JSON.stringify(authority)}`,
          );
        }
      },
    );
  },
);
