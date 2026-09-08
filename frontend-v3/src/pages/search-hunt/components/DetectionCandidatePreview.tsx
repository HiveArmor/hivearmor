import { useState } from 'react';

import { ShieldAlert, X } from 'lucide-react';

import { createRule } from '../../detection-rules/detectionRules.service';
import type { PivotDetectionContext } from '../lib/pivotDetectionContext';
import { buildDraftRuleFromContext } from '../lib/pivotDraftRule';

export interface DetectionCandidatePreviewProps {
  context: PivotDetectionContext;
  onClose: () => void;
}

/**
 * P5 — the governed, NON-deploying half of Pivot → Detection: capture the reproduction context, and (5a)
 * create a DRAFT detection rule from it via the EXISTING createRule service (which writes status=draft).
 * There is NO deploy/activate/approve button here. Submit-for-review and the SOC-manager approval that flips
 * a rule to active live in the existing Detection UI, reached via the "Open in Detection review" link — a
 * separate, SOC_MANAGER-gated step (§29). No LLM is used in 5a; the CEL is a deterministic starting point.
 */
export function DetectionCandidatePreview({ context, onClose }: DetectionCandidatePreviewProps): JSX.Element {
  const c = context;
  const [drafting, setDrafting] = useState(false);
  const [draftId, setDraftId] = useState<string | number | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const draftForReview = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const created = await createRule(buildDraftRuleFromContext(c));
      setDraftId(created.id);
    } catch {
      setDraftError('Could not create the draft. Nothing was changed.');
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="detection-candidate" role="note" aria-label="Detection candidate context">
      <div className="detection-candidate__head">
        <span className="detection-candidate__glyph" aria-hidden="true"><ShieldAlert size={14} /></span>
        <span className="detection-candidate__title">Detection candidate — captured context</span>
        <button type="button" className="detection-candidate__close" onClick={onClose} aria-label="Dismiss detection candidate">
          <X size={13} />
        </button>
      </div>

      <dl className="detection-candidate__grid">
        <dt>Combination</dt>
        <dd><code>{c.rowField}</code> = <code>{c.selectedCell.row}</code> × <code>{c.colField}</code> = <code>{c.selectedCell.col}</code></dd>
        <dt>Observed</dt>
        <dd>{c.selectedCell.value.toLocaleString()} ({c.measure.function}{c.measure.distinctField ? ` ${c.measure.distinctField}` : ''})</dd>
        {c.significant && (
          <>
            <dt>Significance</dt>
            <dd>{c.significant.direction === 'over' ? 'over' : 'under'}-represented · ~{c.significant.ratio}× expected {c.significant.expected}</dd>
          </>
        )}
        <dt>Query</dt>
        <dd><code>{c.query}</code></dd>
        {c.pivotFilters.length > 0 && (
          <>
            <dt>Pivot filters</dt>
            <dd>{c.pivotFilters.map((f) => <code key={f}>{f}</code>)}</dd>
          </>
        )}
        <dt>Search</dt>
        <dd>{c.searchId ?? '—'}{c.computedAt ? ` · ${c.computedAt}` : ''}</dd>
      </dl>

      {draftId == null ? (
        <div className="detection-candidate__actions">
          <button type="button" className="detection-candidate__draft" onClick={() => void draftForReview()} disabled={drafting}>
            {drafting ? 'Creating draft…' : 'Draft rule for review'}
          </button>
        </div>
      ) : (
        <p className="detection-candidate__drafted" role="status">
          Draft created ({String(draftId)}). <a href={`/detection-rules/${draftId}`}>Open in Detection review →</a>
        </p>
      )}
      {draftError && <p className="detection-candidate__draft-err" role="alert">{draftError}</p>}

      <p className="detection-candidate__gov">
        Creating a draft does not deploy anything. A SOC manager must review and approve the draft in
        Detection before it detects — nothing here activates a rule.
      </p>
    </div>
  );
}
