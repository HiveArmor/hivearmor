import { useState } from 'react';
import type React from 'react';

import { ConfidenceBadge } from './ConfidenceBadge';

import { HaCard } from '@/components/ha-card';

import './AiVerdictCard.css';

export type AiVerdict = 'malicious' | 'suspicious' | 'benign' | 'inconclusive';

export interface AiReasoningStep {
  /** Short stage label, e.g. "Enrichment". */
  label: string;
  /** Optional detail line under the label. */
  detail?: string;
  /** Stage state — drives the timeline node color. */
  state?: 'done' | 'active' | 'pending';
}

export interface AiEvidenceItem {
  label: string;
  /** Value node — may be mono identifier, a link, etc. (rendered by the consumer). */
  value: React.ReactNode;
}

export interface AiVerdictCardProps {
  verdict: AiVerdict;
  /** Confidence 0–100 (or 0–1). */
  confidence: number;
  /** One-line summary shown on the Summary tab. */
  summary: React.ReactNode;
  /** The agent's conclusion / rationale (Conclusion tab). */
  conclusion?: React.ReactNode;
  /** Ordered reasoning stages shown on the Summary tab as a timeline. */
  reasoning?: AiReasoningStep[];
  /** Evidence items shown on the Evidence Locker tab. */
  evidence?: AiEvidenceItem[];
  /** Fired on 👍 / 👎 feedback — "up" refines the verdict, "down" flags it. */
  onFeedback?: (vote: 'up' | 'down') => void;
  className?: string;
}

const VERDICT_LABEL: Record<AiVerdict, string> = {
  malicious: 'Malicious',
  suspicious: 'Suspicious',
  benign: 'Benign',
  inconclusive: 'Inconclusive',
};

type Tab = 'summary' | 'conclusion' | 'evidence';

/**
 * AiVerdictCard — the keystone of the AI component kit (design §5a). Built on HaCard, it presents
 * the agent's verdict → confidence → reasoning → evidence, all wearing `--ha-intelligence-primary`
 * provenance (a left violet rule marks the whole surface as AI-produced). Tabs: Summary (verdict +
 * reasoning timeline), Conclusion (rationale), Evidence Locker (supporting items). Thumbs feedback
 * closes the learning loop.
 *
 * Verdict color follows the value-color rule: it's a *verdict* (meaning), so it uses the
 * intelligence-violet family, paired with a text label — never color alone. Tokens only, WCAG AA.
 */
export function AiVerdictCard({
  verdict,
  confidence,
  summary,
  conclusion,
  reasoning,
  evidence,
  onFeedback,
  className,
}: AiVerdictCardProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('summary');
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  const handleVote = (v: 'up' | 'down'): void => {
    setVote(v);
    onFeedback?.(v);
  };

  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'summary', label: 'Summary', show: true },
    { id: 'conclusion', label: 'Conclusion', show: Boolean(conclusion) },
    { id: 'evidence', label: `Evidence Locker${evidence ? ` (${evidence.length})` : ''}`, show: Boolean(evidence?.length) },
  ];

  return (
    <HaCard className={['ai-verdict', className].filter(Boolean).join(' ')}>
      <HaCard.Header className="ai-verdict__header">
        <span className="ai-verdict__title">
          <span className="ai-verdict__glyph" aria-hidden="true">✦</span>
          AI Verdict
        </span>
        <span className="ai-verdict__verdict" data-verdict={verdict}>
          {VERDICT_LABEL[verdict]}
        </span>
        <ConfidenceBadge value={confidence} />
      </HaCard.Header>

      <div className="ai-verdict__tabs" role="tablist" aria-label="AI verdict detail">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={['ai-verdict__tab', tab === t.id ? 'ai-verdict__tab--on' : ''].filter(Boolean).join(' ')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <HaCard.Body className="ai-verdict__body">
        {tab === 'summary' && (
          <>
            <p className="ai-verdict__summary">{summary}</p>
            {reasoning && reasoning.length > 0 && (
              <ol className="ai-verdict__timeline" aria-label="Reasoning steps">
                {reasoning.map((step, i) => (
                  <li
                    key={`${step.label}-${i}`}
                    className={`ai-verdict__step ai-verdict__step--${step.state ?? 'done'}`}
                  >
                    <span className="ai-verdict__step-label">{step.label}</span>
                    {step.detail && <span className="ai-verdict__step-detail">{step.detail}</span>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {tab === 'conclusion' && <div className="ai-verdict__conclusion">{conclusion}</div>}

        {tab === 'evidence' && evidence && (
          <dl className="ai-verdict__evidence">
            {evidence.map((item, i) => (
              <div className="ai-verdict__evidence-row" key={`${item.label}-${i}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </HaCard.Body>

      <HaCard.Footer className="ai-verdict__footer">
        <span className="ai-verdict__provenance" aria-hidden="true">✦ AI-generated · verify before acting</span>
        <div className="ai-verdict__feedback">
          <button
            type="button"
            className={['ai-verdict__thumb', vote === 'up' ? 'ai-verdict__thumb--on' : ''].filter(Boolean).join(' ')}
            aria-pressed={vote === 'up'}
            aria-label="Confirm verdict (improves detection)"
            onClick={() => handleVote('up')}
          >
            👍
          </button>
          <button
            type="button"
            className={['ai-verdict__thumb', vote === 'down' ? 'ai-verdict__thumb--on' : ''].filter(Boolean).join(' ')}
            aria-pressed={vote === 'down'}
            aria-label="Flag verdict as wrong"
            onClick={() => handleVote('down')}
          >
            👎
          </button>
        </div>
      </HaCard.Footer>
    </HaCard>
  );
}
