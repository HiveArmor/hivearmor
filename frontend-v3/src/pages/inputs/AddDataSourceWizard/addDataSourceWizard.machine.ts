/**
 * AddDataSourceWizard — pure state machine (reducer + guards).
 *
 * This module is intentionally free of React or any side-effect library so that
 * it can be unit-tested and property-tested in isolation.
 *
 * Invariants (validated by Property 17):
 *   - state.step ∈ {1, 2, 3} at all times.
 *   - `next` advances step by exactly one when canAdvance(state) is true;
 *     it is a no-op otherwise.
 *   - `back` retreats step by exactly one when step > 1;
 *     it clamps at 1 and is a no-op when already on step 1.
 *
 * Requirements: 11.2, 11.3, 11.4
 */

import type { HaDataSourceType } from '../../../types/dataSource.types';

// ── Types ─────────────────────────────────────────────────────────────────────

/** The three wizard steps — constrained to the literal union {1, 2, 3}. */
export type WizardStep = 1 | 2 | 3;

/** All events the wizard reducer handles. */
export type WizardEvent =
  | { kind: 'selectType'; value: HaDataSourceType | null }
  | { kind: 'setConfigField'; key: string; value: string }
  | { kind: 'next' }
  | { kind: 'back' }
  | { kind: 'finish' };

/** Complete wizard state. */
export interface WizardState {
  /** Current step — always 1, 2, or 3. */
  step: WizardStep;
  /** Selected data source type, or null when not yet chosen. */
  type: HaDataSourceType | null;
  /** Free-form config fields keyed by field name. */
  config: Record<string, string>;
  /** True while the POST /api/ha-inputs/sources request is in-flight. */
  submitting: boolean;
  /** Non-null when the last POST returned a 4xx/5xx error (Req 11.6). */
  submitError: string | null;
}

// ── Initial state ─────────────────────────────────────────────────────────────

/** Factory-default wizard state — step 1, nothing selected. */
export const initialWizardState: WizardState = {
  step: 1,
  type: null,
  config: {},
  submitting: false,
  submitError: null,
};

// ── Required fields per type ──────────────────────────────────────────────────

/**
 * The minimum set of non-empty config fields required before the user may
 * advance past Step 2 for each source type.
 *
 * Used by canAdvance() to enforce Requirement 11.4.
 */
export const REQUIRED_FIELDS: Record<HaDataSourceType, readonly string[]> = {
  syslog: ['host', 'port'],
  wineventlog: ['host'],
  agent: ['agentId'],
  kafka: ['brokers', 'topic'],
  aws: ['region', 'roleArn'],
  azure: ['tenantId', 'subscriptionId'],
  gcp: ['projectId'],
};

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Returns true when the wizard's "Next" button should be enabled.
 *
 * Step 1: a type must have been selected (Req 11.3).
 * Step 2: every required field for the selected type must be non-empty after
 *         trimming whitespace (Req 11.4).
 * Step 3: always false — the final action is "Finish", not "Next".
 */
export function canAdvance(state: WizardState): boolean {
  if (state.step === 1) {
    return state.type !== null;
  }
  if (state.step === 2) {
    if (!state.type) return false;
    return REQUIRED_FIELDS[state.type].every(
      (k) => (state.config[k] ?? '').trim().length > 0,
    );
  }
  // Step 3: no "Next" — only "Finish"
  return false;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

/**
 * Pure reducer — produces the next WizardState given the current state and an
 * event.  Does not mutate the input state.
 *
 * Clamping rules (Req 11.2):
 *   - step is always in {1, 2, 3}.
 *   - `next` on step 3 is a no-op (already at the final step).
 *   - `back` on step 1 is a no-op (cannot retreat below 1).
 */
export function reduce(state: WizardState, event: WizardEvent): WizardState {
  switch (event.kind) {
    case 'selectType':
      // Changing the type resets config to avoid stale field values.
      return { ...state, type: event.value, config: {} };

    case 'setConfigField':
      return {
        ...state,
        config: { ...state.config, [event.key]: event.value },
      };

    case 'next':
      // Guard: no-op when the current step's validation requirements are unmet.
      if (!canAdvance(state)) return state;
      // Clamp: cannot advance beyond step 3.
      if (state.step === 3) return state;
      return { ...state, step: (state.step + 1) as WizardStep };

    case 'back':
      // Clamp: cannot retreat below step 1.
      if (state.step === 1) return state;
      return { ...state, step: (state.step - 1) as WizardStep };

    case 'finish':
      // Marks the wizard as in-flight; the component layer issues the POST.
      return { ...state, submitting: true };
  }
}
