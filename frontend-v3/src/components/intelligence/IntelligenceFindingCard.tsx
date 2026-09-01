/**
 * IntelligenceFindingCard — shared structured finding surface (HI-05/HI-08)
 */

import { HaCard } from '@/components/ha-card';
import { FactsInferenceLayout } from '@/components/intelligence/FactsInferenceLayout';
import { isUnconfiguredFinding } from '@/services/intelligenceFinding.service';
import type { IntelligenceFindingDTO } from '@/types/intelligenceFinding.types';

import './IntelligenceFindingCard.css';

export interface IntelligenceFindingCardProps {
  finding: IntelligenceFindingDTO;
  title?: string;
  compact?: boolean;
  showAnswer?: boolean;
}

export function IntelligenceFindingCard({
  finding,
  title,
  compact = false,
  showAnswer = false,
}: IntelligenceFindingCardProps): JSX.Element {
  const unconfigured = isUnconfiguredFinding(finding);

  return (
    <HaCard as="article" compact={compact} className="hi-finding-card" aria-label="Intelligence finding">
      <HaCard.Header className="hi-finding-card__head">
        <div>
          <strong>{title ?? finding.title ?? 'Hive Intelligence finding'}</strong>
          {finding.provenance && (
            <span className="hi-finding-card__provenance">{finding.provenance}</span>
          )}
        </div>
        <span className="hi-finding-card__badge">STAGING CANDIDATE</span>
      </HaCard.Header>

      <HaCard.Body className="hi-finding-card__body">
        {unconfigured ? (
          <p className="hi-finding-card__honesty" role="status">
            {finding.answer ?? finding.summary ?? 'Assistive SOC AI is not configured.'}
          </p>
        ) : (
          <>
            {finding.summary && !showAnswer && (
              <p className="hi-finding-card__summary">{finding.summary}</p>
            )}
            {showAnswer && finding.answer && (
              <p className="hi-finding-card__summary">{finding.answer}</p>
            )}
            <FactsInferenceLayout finding={finding} compact={compact} />
          </>
        )}
      </HaCard.Body>

      <HaCard.Footer className="hi-finding-card__meta">
        <span>
          Confidence:{' '}
          {Number.isFinite(finding.confidence) ? finding.confidence.toFixed(2) : '—'}
        </span>
        <span>
          Sources:{' '}
          {finding.sources.length > 0 ? finding.sources.join(', ') : 'none returned'}
        </span>
        {finding.confidenceExplanation && (
          <span className="hi-finding-card__explanation">{finding.confidenceExplanation}</span>
        )}
      </HaCard.Footer>
    </HaCard>
  );
}
