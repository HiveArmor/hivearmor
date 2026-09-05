import { useEffect, useRef, useState } from 'react';

import { X } from 'lucide-react';

import type { HuntVerdictResponse } from '../ai/huntAiContract.types';
import { submitAiFeedback } from '../ai/huntAiService';

import { AiVerdictCard } from '@/components/ai-verdict-card/AiVerdictCard';

import './HuntVerdictPanel.css';

export interface HuntVerdictPanelProps {
  verdict: HuntVerdictResponse;
  /** Scroll+flash the cited grid rows (reasoning-cites-rows, move 3). */
  onCiteRows: (rowRefs: string[]) => void;
  /** Open the propose-only promote-to-case flow (move 8). */
  onPromote: () => void;
  /** Close the panel. */
  onClose: () => void;
}

function fmtPct(v: number): string {
  return `${Math.round(v <= 1 ? v * 100 : v)}%`;
}

/**
 * The AI verdict rendered as a RIGHT-SIDE PANEL (reusing the event-flyout shell), so the full
 * analysis — reasoning, evidence, trust calibration, feedback, promote — is read in a dedicated dock
 * without cramming an inline card above the results grid. Consistent with EventDetailFlyout; the
 * best-in-class pattern used by Elastic / Splunk / Chronicle for detail surfaces.
 *
 * All AI provenance wears --ha-intelligence-primary + the ✦ glyph + a verify caveat.
 */
export function HuntVerdictPanel({ verdict, onCiteRows, onPromote, onClose }: HuntVerdictPanelProps): JSX.Element {
  const [feedbackSent, setFeedbackSent] = useState<'up' | 'down' | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { calibration, reasoning } = verdict;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFeedback = (vote: 'up' | 'down'): void => {
    setFeedbackSent(vote);
    void submitAiFeedback({ targetType: 'verdict', targetId: verdict.verdictId, vote });
  };

  const reasoningBlock = (
    <ol className="hunt-verdict-panel__reasoning" aria-label="Reasoning steps">
      {reasoning.map((step, i) => {
        const hasRefs = Boolean(step.rowRefs && step.rowRefs.length > 0);
        return (
          <li key={step.id} className="hunt-verdict-panel__rstep">
            <span className="hunt-verdict-panel__rnum" aria-hidden="true">{i + 1}</span>
            <span className="hunt-verdict-panel__rtext">
              <span className="hunt-verdict-panel__rlabel">{step.label}</span>
              {step.detail && <span className="hunt-verdict-panel__rdetail">{step.detail}</span>}
              {hasRefs && (
                <button
                  type="button"
                  className="hunt-verdict-panel__cite"
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
    <span className="hunt-verdict-panel__summary">
      {verdict.summary}
      {reasoningBlock}
    </span>
  );

  const evidenceItems = verdict.evidence.map((item) => ({
    label: item.label,
    value: (
      <span className={item.provenanceLensed ? 'hunt-verdict-panel__ai-val' : undefined}>
        {item.value}
        {item.provenanceLensed && <span className="hunt-verdict-panel__ai-glyph" aria-hidden="true"> ✦</span>}
      </span>
    ),
  }));

  return (
    <aside
      className="event-flyout hunt-verdict-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="hunt-verdict-panel-title"
    >
      <header className="event-flyout__header">
        <div>
          <span className="event-flyout__label">
            <span className="hunt-verdict-panel__glyph" aria-hidden="true">✦</span> AI VERDICT
          </span>
          <h2 id="hunt-verdict-panel-title">{verdict.verdict} · {fmtPct(verdict.confidence)}</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="event-flyout__close"
          onClick={onClose}
          aria-label="Close AI verdict"
        >
          <X size={17} />
        </button>
      </header>

      <div className="hunt-verdict-panel__body">
        <AiVerdictCard
          verdict={verdict.verdict}
          confidence={verdict.confidence}
          summary={summaryNode}
          conclusion={verdict.conclusion}
          evidence={evidenceItems}
          onFeedback={handleFeedback}
        />

        {/* Trust calibration — REDESIGN §6: confidence never stands alone. */}
        <div className="hunt-verdict-panel__trust">
          <span className="hunt-verdict-panel__trust-glyph" aria-hidden="true">✦</span>
          <span className="hunt-verdict-panel__trust-text">
            On <b>{calibration.scope}</b>, this agent agreed with analysts{' '}
            <b>{fmtPct(calibration.agreementRate)}</b> of the time
            {' '}(last {calibration.window}, n={calibration.sampleSize}, overrides {calibration.overrideTrend}).
            <span className="hunt-verdict-panel__trust-note"> — its track record, not just its confidence.</span>
          </span>
        </div>

        {feedbackSent && (
          <p className="hunt-verdict-panel__fb-ack" role="status">
            Thanks — {feedbackSent === 'up' ? 'reinforced' : 'flagged'}. This feeds the agent&apos;s track record.
          </p>
        )}
      </div>

      <footer className="hunt-verdict-panel__footer">
        <button type="button" className="hunt-verdict-panel__promote" onClick={onPromote}>
          Promote to case →
        </button>
      </footer>
    </aside>
  );
}
