import type React from 'react';

import { HaCard } from '@/components/ha-card';

import './ApprovalCard.css';

export type ApprovalRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalCardProps {
  /** The action the agent wants to take, e.g. "Isolate HOST-1000". */
  action: string;
  /** Which agent proposed it, e.g. "Response agent". */
  agent?: string;
  /** Risk tier — drives the risk badge + left rule tone. */
  risk: ApprovalRisk;
  /** Plain-language blast radius, e.g. "1 endpoint · 1 user session". */
  blastRadius: React.ReactNode;
  /** Whether the action can be undone. */
  reversible?: boolean;
  /** Optional expiry line, e.g. "auto-rejects in 15m". */
  expiry?: string;
  /** Optional richer detail (e.g. an embedded PlanThenExecuteDiff summary). */
  children?: React.ReactNode;
  onApprove?: () => void;
  onModify?: () => void;
  onReject?: () => void;
  className?: string;
}

const RISK_LABEL: Record<ApprovalRisk, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

/**
 * ApprovalCard — a pending agent-proposed action awaiting human decision (design §5a). It leads
 * with the decision inputs a human needs: the action, its RISK tier, its BLAST RADIUS (how much it
 * touches), and whether it is REVERSIBLE — then Approve / Modify / Reject, with an optional expiry.
 * This is the human-in-the-loop gate for any state-changing agent action.
 *
 * Built on HaCard; a risk-toned left rule signals stakes at a glance (risk = meaning, paired with
 * the text label). Tokens only, WCAG AA.
 */
export function ApprovalCard({
  action,
  agent,
  risk,
  blastRadius,
  reversible,
  expiry,
  children,
  onApprove,
  onModify,
  onReject,
  className,
}: ApprovalCardProps): JSX.Element {
  return (
    <HaCard className={['ha-approval', `ha-approval--${risk}`, className].filter(Boolean).join(' ')}>
      <HaCard.Header className="ha-approval__header">
        <span className="ha-approval__title">
          <span className="ha-approval__glyph" aria-hidden="true">✦</span>
          {action}
        </span>
        <span className="ha-approval__risk" data-risk={risk}>{RISK_LABEL[risk]}</span>
      </HaCard.Header>

      <HaCard.Body className="ha-approval__body">
        <dl className="ha-approval__facts">
          <div className="ha-approval__fact">
            <dt>Blast radius</dt>
            <dd>{blastRadius}</dd>
          </div>
          {reversible !== undefined && (
            <div className="ha-approval__fact">
              <dt>Reversible</dt>
              <dd className={reversible ? 'ha-approval__yes' : 'ha-approval__no'}>
                {reversible ? 'Yes — can be rolled back' : 'No — cannot be undone'}
              </dd>
            </div>
          )}
          {agent && (
            <div className="ha-approval__fact">
              <dt>Proposed by</dt>
              <dd>{agent}</dd>
            </div>
          )}
        </dl>
        {children}
      </HaCard.Body>

      <HaCard.Footer className="ha-approval__footer">
        {expiry && <span className="ha-approval__expiry">{expiry}</span>}
        <div className="ha-approval__actions">
          {onReject && (
            <button type="button" className="ha-approval__btn ha-approval__btn--reject" onClick={onReject}>
              Reject
            </button>
          )}
          {onModify && (
            <button type="button" className="ha-approval__btn" onClick={onModify}>
              Modify
            </button>
          )}
          {onApprove && (
            <button type="button" className="ha-approval__btn ha-approval__btn--approve" onClick={onApprove}>
              Approve
            </button>
          )}
        </div>
      </HaCard.Footer>
    </HaCard>
  );
}
