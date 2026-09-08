import { ShieldAlert, X } from 'lucide-react';

import type { PivotDetectionContext } from '../lib/pivotDetectionContext';

export interface DetectionCandidatePreviewProps {
  context: PivotDetectionContext;
  onClose: () => void;
}

/**
 * P5 PR 1 — the SAFE half of Pivot → Detection: capture and show the reproduction context for a selected
 * combination. It DRAFTS NO RULE, calls no LLM, writes nothing, and has NO deploy/activate button. Rule
 * drafting + the governed SOC-manager review/approve flow are a separate, later PR (§29). This panel exists
 * so the analyst can see exactly what evidence a detection candidate would be built from.
 */
export function DetectionCandidatePreview({ context, onClose }: DetectionCandidatePreviewProps): JSX.Element {
  const c = context;
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

      <p className="detection-candidate__gov">
        This only captures the evidence. No rule is drafted or deployed here — turning this into a detection
        rule is a separate, SOC-manager-reviewed and approved step.
      </p>
    </div>
  );
}
