import type React from 'react';

import { HaCard } from '@/components/ha-card';

import './PlanThenExecuteDiff.css';

export interface PlanStep {
  /** What the step does, e.g. "Block 10.0.14.203 at the perimeter firewall". */
  action: string;
  /** Change kind — drives the diff marker (+ add / − remove / ~ modify). */
  kind: 'add' | 'remove' | 'modify';
  /** Optional expected effect line. */
  effect?: string;
}

export interface PlanThenExecuteDiffProps {
  /** Human title, e.g. "Contain HOST-1000". */
  title: string;
  /** Ordered plan the agent proposes to execute. */
  steps: PlanStep[];
  /** Rollback plan shown alongside — what undoes this if it goes wrong. */
  rollback: React.ReactNode;
  /** Confirm the plan and execute (gated — nothing runs without this). */
  onConfirm?: () => void;
  /** Optional dry-run action. */
  onDryRun?: () => void;
  /** Optional cancel. */
  onCancel?: () => void;
  className?: string;
}

const KIND_SYMBOL: Record<PlanStep['kind'], string> = { add: '+', remove: '−', modify: '~' };

/**
 * PlanThenExecuteDiff — shows the agent's remediation PLAN before anything happens (design §5a):
 * an ordered, diff-style list of the changes it proposes, each with its expected effect, plus the
 * rollback plan — all behind a Confirm gate. This is the "think → decide → act with a human gate"
 * pattern: no state-changing action runs until the analyst confirms.
 *
 * Built on HaCard, violet provenance. Tokens only.
 */
export function PlanThenExecuteDiff({
  title,
  steps,
  rollback,
  onConfirm,
  onDryRun,
  onCancel,
  className,
}: PlanThenExecuteDiffProps): JSX.Element {
  return (
    <HaCard className={['ha-plan', className].filter(Boolean).join(' ')}>
      <HaCard.Header className="ha-plan__header">
        <span className="ha-plan__title">
          <span className="ha-plan__glyph" aria-hidden="true">✦</span>
          Proposed plan · {title}
        </span>
      </HaCard.Header>

      <HaCard.Body className="ha-plan__body">
        <ol className="ha-plan__steps" aria-label="Proposed steps">
          {steps.map((step, i) => (
            <li className={`ha-plan__step ha-plan__step--${step.kind}`} key={`${step.action}-${i}`}>
              <span className="ha-plan__marker" aria-hidden="true">{KIND_SYMBOL[step.kind]}</span>
              <span className="ha-plan__action">
                {step.action}
                {step.effect && <span className="ha-plan__effect">{step.effect}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="ha-plan__rollback">
          <span className="ha-plan__rollback-label">Rollback</span>
          <span className="ha-plan__rollback-body">{rollback}</span>
        </div>
      </HaCard.Body>

      <HaCard.Footer className="ha-plan__footer">
        <span className="ha-plan__gate" aria-hidden="true">✦ Nothing runs until you confirm</span>
        <div className="ha-plan__actions">
          {onCancel && (
            <button type="button" className="ha-plan__btn" onClick={onCancel}>
              Cancel
            </button>
          )}
          {onDryRun && (
            <button type="button" className="ha-plan__btn" onClick={onDryRun}>
              Dry run
            </button>
          )}
          {onConfirm && (
            <button type="button" className="ha-plan__btn ha-plan__btn--confirm" onClick={onConfirm}>
              Confirm plan
            </button>
          )}
        </div>
      </HaCard.Footer>
    </HaCard>
  );
}
