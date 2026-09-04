import { useState } from 'react';


import type { HuntVerdictResponse } from '../ai/huntAiContract.types';
import { submitAiFeedback } from '../ai/huntAiService';

import { AiVerdictCard } from '@/components/ai-verdict-card/AiVerdictCard';

import './HuntVerdictLead.css';

export interface HuntVerdictLeadProps {
  verdict: HuntVerdictResponse;
  /** Scroll+flash the cited grid rows (reasoning-cites-rows, move 3). */
  onCiteRows: (rowRefs: string[]) => void;
  /** Open the propose-only promote-to-case flow (move 8). */
  onPromote: () => void;
}

function fmtPct(v: number): string {
  return `${Math.round(v <= 1 ? v * 100 : v)}%`;
}

/**
 * The verdict "lead" that sits ABOVE the results grid (move 1). Composes the locked
 * AiVerdictCard with:
 *  - a trust-calibration line (REDESIGN §6): confidence is NEVER shown without the
 *    agent's track record beside it;
 *  - reasoning-cites-rows: each reasoning step with rowRefs is clickable → scrolls
 *    and flashes the exact grid rows (move 3);
 *  - a propose-only "Promote to case" action (move 8, no execution).
 *
 * All AI provenance wears --ha-intelligence-primary + the ✦ glyph + a verify caveat.
 */
export function HuntVerdictLead({ verdict, onCiteRows, onPromote }: HuntVerdictLeadProps): JSX.Element {
  const [feedbackSent, setFeedbackSent] = useState<'up' | 'down' | null>(null);
  const { calibration, reasoning } = verdict;

  const handleFeedback = (vote: 'up' | 'down'): void => {
    setFeedbackSent(vote);
    void submitAiFeedback({ targetType: 'verdict', targetId: verdict.verdictId, vote });
  };

  // Reasoning rendered as clickable citations (the AiVerdictCard timeline is not
  // interactive), passed to the card as the summary body's companion below.
  const reasoningBlock = (
    <ol className="hunt-verdict-lead__reasoning" aria-label="Reasoning steps">
      {reasoning.map((step, i) => {
        const hasRefs = Boolean(step.rowRefs && step.rowRefs.length > 0);
        return (
          <li key={step.id} className="hunt-verdict-lead__rstep">
            <span className="hunt-verdict-lead__rnum" aria-hidden="true">{i + 1}</span>
            <span className="hunt-verdict-lead__rtext">
              <span className="hunt-verdict-lead__rlabel">{step.label}</span>
              {step.detail && <span className="hunt-verdict-lead__rdetail">{step.detail}</span>}
              {hasRefs && (
                <button
                  type="button"
                  className="hunt-verdict-lead__cite"
                  onClick={() => onCiteRows(step.rowRefs ?? [])}
                >
                  Show {step.rowRefs?.length} cited {step.rowRefs?.length === 1 ? 'row' : 'rows'} →
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );

  const summaryNode = (
    <span className="hunt-verdict-lead__summary">
      {verdict.summary}
      {reasoningBlock}
    </span>
  );

  const evidenceItems = verdict.evidence.map((item) => ({
    label: item.label,
    value: (
      <span className={item.provenanceLensed ? 'hunt-verdict-lead__ai-val' : undefined}>
        {typeof item.value === 'string' ? item.value : item.value}
        {item.provenanceLensed && <span className="hunt-verdict-lead__ai-glyph" aria-hidden="true"> ✦</span>}
      </span>
    ),
  }));

  return (
    <section className="hunt-verdict-lead" aria-label="AI verdict for these results">
      <AiVerdictCard
        verdict={verdict.verdict}
        confidence={verdict.confidence}
        summary={summaryNode}
        conclusion={verdict.conclusion}
        evidence={evidenceItems}
        onFeedback={handleFeedback}
      />

      {/* Trust calibration — REDESIGN §6, first-class. Confidence never stands alone. */}
      <div className="hunt-verdict-lead__trust">
        <span className="hunt-verdict-lead__trust-glyph" aria-hidden="true">✦</span>
        <span className="hunt-verdict-lead__trust-text">
          On <b>{calibration.scope}</b>, this agent agreed with analysts{' '}
          <b>{fmtPct(calibration.agreementRate)}</b> of the time
          {' '}(last {calibration.window}, n={calibration.sampleSize}, overrides {calibration.overrideTrend}).
          <span className="hunt-verdict-lead__trust-note"> — its track record, not just its confidence.</span>
        </span>
        <button type="button" className="hunt-verdict-lead__promote" onClick={onPromote}>
          Promote to case →
        </button>
      </div>

      {feedbackSent && (
        <p className="hunt-verdict-lead__fb-ack" role="status">
          Thanks — {feedbackSent === 'up' ? 'reinforced' : 'flagged'}. This feeds the agent&apos;s track record.
        </p>
      )}
    </section>
  );
}
