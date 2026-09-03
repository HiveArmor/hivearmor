import { Check } from 'lucide-react';

import './HaStepper.css';

export interface HaStep {
  /** Stable id for the step (used as the React key). */
  id: string;
  /** Visible label under the marker. */
  label: string;
}

export interface HaStepperProps {
  /** Ordered steps, left to right. */
  steps: HaStep[];
  /**
   * Zero-based index of the CURRENT step. Steps before it render completed,
   * steps after it render upcoming. Clamped to the valid range.
   */
  current: number;
  /** Accessible name for the whole stepper (e.g. "Report configuration"). */
  ariaLabel: string;
  className?: string;
}

type StepState = 'completed' | 'active' | 'upcoming';

function stateFor(index: number, current: number): StepState {
  if (index < current) return 'completed';
  if (index === current) return 'active';
  return 'upcoming';
}

/**
 * A read-only horizontal step progress indicator. This is NOT an interactive
 * wizard (see HaWizard for that) — it communicates position in a known
 * sequence. Consolidates the hand-rolled gov/iam/int/pipe/tfa steppers.
 *
 * Rendered as an ordered list; the current step carries aria-current="step",
 * and each marker's state is announced as text so state is never colour-only.
 */
export function HaStepper({ steps, current, ariaLabel, className }: HaStepperProps) {
  const safeCurrent = Math.max(0, Math.min(current, steps.length - 1));
  const classes = className ? `ha-stepper ${className}` : 'ha-stepper';
  return (
    <ol className={classes} aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const state = stateFor(index, safeCurrent);
        return (
          <li
            key={step.id}
            className="ha-stepper__step"
            data-state={state}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className="ha-stepper__marker" aria-hidden="true">
              {state === 'completed' ? <Check size={15} /> : index + 1}
            </span>
            <span className="ha-stepper__label">
              {step.label}
              <span className="ha-stepper__sr">
                {state === 'completed' ? ' (completed)' : state === 'active' ? ' (current step)' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
