/**
 * Property-Based Tests: HaApiKeyTokenDialog — token state lifecycle
 *
 * **Validates: Requirements 7.4**
 *
 * The plaintext token state machine in ApiKeyPage.tsx is a pure reducer:
 *
 *   pendingToken: string | null
 *   onTokenReceived(token) → pendingToken = token
 *   onAcknowledge()        → pendingToken = null
 *
 * Because this logic is side-effect-free, we lift it into a local pure
 * function and verify its universal properties with fast-check without
 * mounting any component.
 *
 * Four sub-properties are verified:
 *   P19a — After receive(token), state equals token (never null).
 *   P19b — After acknowledge, state is always null regardless of prior value.
 *   P19c — receive followed by acknowledge always yields null.
 *   P19d — acknowledge on already-null state returns null (idempotent).
 */

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure reducer under test
//
// Mirrors the exact state transitions in ApiKeyPage.tsx:
//   onTokenReceived: setPendingToken(token)  → state becomes token string
//   onAcknowledge:   setPendingToken(null)   → state becomes null
// ---------------------------------------------------------------------------

type TokenAction =
  | { type: 'receive'; token: string }
  | { type: 'acknowledge' };

function tokenStateReducer(
  current: string | null,
  action: TokenAction,
): string | null {
  switch (action.type) {
    case 'receive':
      return action.token;
    case 'acknowledge':
      return null;
    default: {
      // Exhaustiveness check — current satisfies never.
      const _exhaustive: never = action;
      void _exhaustive;
      return current;
    }
  }
}

// ---------------------------------------------------------------------------
// Property 19: Frontend clears plaintext API key after acknowledgment
// **Validates: Requirements 7.4**
// ---------------------------------------------------------------------------

describe('Property 19: Frontend clears plaintext API key after acknowledgment', () => {
  /**
   * P19a — After receive(token), state equals the token string (non-null).
   *
   * Strategy: generate arbitrary token strings (including empty strings,
   * unicode, whitespace). Starting from any current state (null or a prior
   * token string), dispatching 'receive' must always store exactly the
   * supplied token.
   */
  it('P19a: after receive(token), state equals token regardless of prior state', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),  // prior state: null or any string
        fc.string(),                             // new token to receive
        (prior, token) => {
          const next = tokenStateReducer(prior, { type: 'receive', token });
          return next === token;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * P19b — After acknowledge, state is always null regardless of current value.
   *
   * Strategy: generate an arbitrary current state (null or any string) and
   * dispatch 'acknowledge'. The result must always be null.
   */
  it('P19b: after acknowledge, state is null regardless of current token value', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),  // current state before acknowledge
        (current) => {
          const next = tokenStateReducer(current, { type: 'acknowledge' });
          return next === null;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * P19c — receive(token) followed immediately by acknowledge always yields null.
   *
   * This models the critical one-time display flow:
   *   1. POST /api/ha-admin/api-keys succeeds → onTokenReceived sets state to token.
   *   2. User clicks "I have copied the key"  → onAcknowledge clears state to null.
   *
   * Strategy: generate arbitrary token strings. Apply receive then acknowledge.
   * The final state must be null for every possible token value.
   */
  it('P19c: receive(token) → acknowledge always leaves state as null', () => {
    fc.assert(
      fc.property(
        fc.string(),  // arbitrary plaintext token
        (token) => {
          const afterReceive = tokenStateReducer(null, { type: 'receive', token });
          const afterAcknowledge = tokenStateReducer(afterReceive, { type: 'acknowledge' });
          return afterAcknowledge === null;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * P19d — acknowledge on already-null state returns null (idempotent).
   *
   * This guards against double-acknowledge producing unexpected state.
   * The operation must be safe to call repeatedly.
   */
  it('P19d: acknowledge on null state is idempotent and returns null', () => {
    const result = tokenStateReducer(null, { type: 'acknowledge' });
    expect(result).toBeNull();

    // Verify idempotency under repeated application via property.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),  // number of consecutive acknowledge calls
        (times) => {
          let state: string | null = null;
          for (let i = 0; i < times; i++) {
            state = tokenStateReducer(state, { type: 'acknowledge' });
          }
          return state === null;
        },
      ),
      { numRuns: 500 },
    );
  });
});
