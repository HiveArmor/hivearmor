/**
 * ApprovalPanel — Review status banner, approve/reject buttons (SOC_MANAGER),
 * comment input, approval history (Sprint 47 DET-016)
 */

import { useCallback, useState } from 'react';

import { CheckCircle2, Clock3, MessageSquare, ShieldCheck, XCircle } from 'lucide-react';

import type { ApprovalStatus, RuleApproval, RuleStatus } from '@/pages/detection-rules/types/detection.types';

interface ApprovalPanelProps {
  ruleStatus: RuleStatus;
  approvals: RuleApproval[];
  canApprove: boolean;
  onApprove: (comment: string) => void;
  onReject: (comment: string) => void;
  onSubmitReview: () => void;
  isProcessing?: boolean;
}

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  pending: 'Pending',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function ApprovalPanel({
  ruleStatus,
  approvals,
  canApprove,
  onApprove,
  onReject,
  onSubmitReview,
  isProcessing = false,
}: ApprovalPanelProps): JSX.Element {
  const [comment, setComment] = useState('');

  const handleApprove = useCallback(() => {
    onApprove(comment.trim());
    setComment('');
  }, [comment, onApprove]);

  const handleReject = useCallback(() => {
    onReject(comment.trim());
    setComment('');
  }, [comment, onReject]);

  const isInReview = ruleStatus === 'review';
  const isDraft = ruleStatus === 'draft';

  return (
    <section className="approval-panel" aria-label="Rule approval">
      {/* Status banner */}
      <div className="approval-panel__banner" data-status={ruleStatus}>
        {isInReview && (
          <>
            <Clock3 size={16} />
            <div>
              <strong>Awaiting review</strong>
              <small>Rule is locked for editing until approved or rejected.</small>
            </div>
          </>
        )}
        {ruleStatus === 'active' && (
          <>
            <CheckCircle2 size={16} />
            <div>
              <strong>Published</strong>
              <small>Rule is active and executing on schedule.</small>
            </div>
          </>
        )}
        {isDraft && (
          <>
            <ShieldCheck size={16} />
            <div>
              <strong>Draft</strong>
              <small>Submit for review when ready.</small>
            </div>
          </>
        )}
      </div>

      {/* Actions for review state */}
      {isInReview && canApprove && (
        <div className="approval-panel__actions">
          <label className="approval-panel__comment">
            <MessageSquare size={14} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional review comment…"
              rows={2}
            />
          </label>
          <div className="approval-panel__buttons">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isProcessing}
              className="detection-primary-button"
            >
              <CheckCircle2 size={14} /> Approve & publish
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isProcessing}
              data-variant="danger"
            >
              <XCircle size={14} /> Reject
            </button>
          </div>
        </div>
      )}

      {/* Submit for review button (draft state) */}
      {isDraft && (
        <div className="approval-panel__submit">
          <button
            type="button"
            onClick={onSubmitReview}
            disabled={isProcessing}
            className="detection-primary-button"
          >
            <ShieldCheck size={14} /> Submit for review
          </button>
        </div>
      )}

      {/* Approval history */}
      {approvals.length > 0 && (
        <div className="approval-panel__history" aria-label="Approval history">
          <strong>Approval history</strong>
          <ul>
            {approvals.map((approval) => (
              <li key={approval.id} data-status={approval.status}>
                <span className="approval-status-badge" data-status={approval.status}>
                  {approval.status === 'approved' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {STATUS_LABELS[approval.status]}
                </span>
                <div>
                  <strong>v{approval.version} — {approval.reviewer}</strong>
                  <small>{formatDate(approval.createdAt)}</small>
                  {approval.comment && <p>{approval.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
