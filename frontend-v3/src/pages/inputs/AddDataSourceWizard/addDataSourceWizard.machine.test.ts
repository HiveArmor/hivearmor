/**
 * addDataSourceWizard.machine.test.ts
 *
 * Property 17: AddDataSourceWizard state machine invariants (fast-check).
 *
 * Three properties are verified:
 *   (a) state.step ∈ {1, 2, 3} always — across arbitrary event sequences.
 *   (b) `next` advances by exactly one step only when canAdvance(state) is true;
 *       it is a strict no-op otherwise.
 *   (c) `back` retreats by exactly one step and clamps at 1 (no-op on step 1).
 *
 * **Validates: Requirements 11.2, 11.3, 11.4**
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_FIELDS,
  canAdvance,
  initialWizardState,
  reduce,
} from './addDataSourceWizard.machine';
import type { WizardEvent, WizardState, WizardStep } from './addDataSourceWizard.machine';
import type { HaDataSourceType } from '../../../types/dataSource.types';

// ── Arbitrary helpers ──────────────────────────────────────────────────────

/** All valid data source types — derived from the machine's own REQUIRED_FIELDS map. */
const ALL_TYPES = Object.keys(REQUIRED_FIELDS) as HaDataSourceType[];

/** Arbitrary nullable data source type. */
const arbitraryType: fc.Arbitrary<HaDataSourceType | null> = fc.oneof(
  fc.constantFrom(...ALL_TYPES),
  fc.constant(null),
);

/** Arbitrary non-empty, non-whitespace-only string (simulates a filled config field). */
const arbitraryNonEmptyValue: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary WizardState.
 *
 * Generates all combinations of step, type, and config so that
 * `canAdvance` is sometimes true and sometimes false across runs.
 */
const arbitraryWizardState: fc.Arbitrary<WizardState> = fc
  .tuple(
    fc.constantFrom<WizardStep>(1, 2, 3),
    arbitraryType,
    fc.boolean(),
    fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null }),
  )
  .chain(([step, type, fillRequired, submitError]) => {
    // Build a config map: when fillRequired is true, populate every required
    // field for the chosen type so canAdvance(step=2) evaluates to true.
    const configArb: fc.Arbitrary<Record<string, string>> =
      step === 2 && type !== null && fillRequired
        ? fc.record(
            Object.fromEntries(
              REQUIRED_FIELDS[type].map((k) => [k, arbitraryNonEmptyValue]),
            ) as Record<string, fc.Arbitrary<string>>,
          )
        : fc.constant({});

    return configArb.map((config) => ({
      step,
      type,
      config,
      submitting: false,
      submitError,
    }));
  });

/**
 * Arbitrary single WizardEvent.
 *
 * Covers all five event kinds with realistic payloads.
 */
const arbitraryEvent: fc.Arbitrary<WizardEvent> = fc.oneof(
  // selectType — picks a valid type or null (clear selection)
  arbitraryType.map((value) => ({ kind: 'selectType' as const, value })),
  // setConfigField — realistic key/value pairs (field names from REQUIRED_FIELDS)
  fc
    .tuple(
      fc.constantFrom(
        'host', 'port', 'agentId', 'brokers', 'topic',
        'region', 'roleArn', 'tenantId', 'subscriptionId', 'projectId',
        'extra',
      ),
      arbitraryNonEmptyValue,
    )
    .map(([key, value]) => ({ kind: 'setConfigField' as const, key, value })),
  // next
  fc.constant({ kind: 'next' as const }),
  // back
  fc.constant({ kind: 'back' as const }),
  // finish
  fc.constant({ kind: 'finish' as const }),
);

// ── Property 17(a): step ∈ {1, 2, 3} always ──────────────────────────────

describe('Property 17 — AddDataSourceWizard state machine', () => {
  it('(a) step is always in {1, 2, 3} after any sequence of events', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryEvent, { minLength: 0, maxLength: 50 }),
        (events) => {
          let state = initialWizardState;
          for (const event of events) {
            state = reduce(state, event);
            const valid = state.step === 1 || state.step === 2 || state.step === 3;
            expect(valid).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── Property 17(b): next advances iff canAdvance is true ─────────────────

  it('(b) next advances by exactly one step when canAdvance is true, and is a no-op otherwise', () => {
    fc.assert(
      fc.property(arbitraryWizardState, (state) => {
        const before = state.step;
        const after = reduce(state, { kind: 'next' });

        if (!canAdvance(state)) {
          // Must be a strict no-op
          expect(after.step).toBe(before);
        } else if (before < 3) {
          // canAdvance is true and step < 3 → advance by exactly 1
          expect(after.step).toBe(before + 1);
        } else {
          // canAdvance is true on step 3? The machine returns false for step 3,
          // but guard the case defensively — should still be no-op (clamped at 3).
          expect(after.step).toBe(3);
        }
      }),
      { numRuns: 500 },
    );
  });

  // ── Property 17(c): back retreats by one and clamps at 1 ─────────────────

  it('(c) back retreats by exactly one step and clamps at 1', () => {
    fc.assert(
      fc.property(arbitraryWizardState, (state) => {
        const before = state.step;
        const after = reduce(state, { kind: 'back' });

        if (before === 1) {
          // Clamped — no-op
          expect(after.step).toBe(1);
        } else {
          // Retreat by exactly one
          expect(after.step).toBe(before - 1);
        }
      }),
      { numRuns: 500 },
    );
  });

  // ── Regression / unit sanity checks ──────────────────────────────────────

  it('initialWizardState has step = 1 and canAdvance returns false (no type selected)', () => {
    expect(initialWizardState.step).toBe(1);
    expect(canAdvance(initialWizardState)).toBe(false);
  });

  it('next on step 1 with no type selected is a no-op', () => {
    const s = reduce(initialWizardState, { kind: 'next' });
    expect(s.step).toBe(1);
  });

  it('next on step 1 after selecting a type advances to step 2', () => {
    let s = reduce(initialWizardState, { kind: 'selectType', value: 'syslog' });
    s = reduce(s, { kind: 'next' });
    expect(s.step).toBe(2);
  });

  it('next on step 2 with all required fields filled advances to step 3', () => {
    let s = reduce(initialWizardState, { kind: 'selectType', value: 'gcp' });
    s = reduce(s, { kind: 'next' }); // → step 2
    s = reduce(s, { kind: 'setConfigField', key: 'projectId', value: 'my-project' });
    s = reduce(s, { kind: 'next' }); // → step 3
    expect(s.step).toBe(3);
  });

  it('next on step 3 is always a no-op (clamped)', () => {
    const step3: WizardState = {
      step: 3,
      type: 'gcp',
      config: { projectId: 'x' },
      submitting: false,
      submitError: null,
    };
    const s = reduce(step3, { kind: 'next' });
    expect(s.step).toBe(3);
  });

  it('back on step 1 is a no-op (clamped)', () => {
    const s = reduce(initialWizardState, { kind: 'back' });
    expect(s.step).toBe(1);
  });

  it('back from step 3 retreats to step 2', () => {
    const step3: WizardState = {
      step: 3,
      type: 'syslog',
      config: { host: 'localhost', port: '514' },
      submitting: false,
      submitError: null,
    };
    const s = reduce(step3, { kind: 'back' });
    expect(s.step).toBe(2);
  });

  it('next on step 2 with missing required fields is a no-op', () => {
    // kafka requires both 'brokers' and 'topic'
    let s = reduce(initialWizardState, { kind: 'selectType', value: 'kafka' });
    s = reduce(s, { kind: 'next' }); // → step 2
    // Only provide one of two required fields
    s = reduce(s, { kind: 'setConfigField', key: 'brokers', value: 'localhost:9092' });
    const before = s.step;
    const after = reduce(s, { kind: 'next' });
    expect(after.step).toBe(before); // still step 2
  });

  it('canAdvance returns false on step 3 regardless of state', () => {
    const step3: WizardState = {
      step: 3,
      type: 'agent',
      config: { agentId: 'abc' },
      submitting: false,
      submitError: null,
    };
    expect(canAdvance(step3)).toBe(false);
  });
});
