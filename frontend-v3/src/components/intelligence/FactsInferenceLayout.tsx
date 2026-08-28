/**
 * FactsInferenceLayout — mandatory facts (neutral) vs inference (violet) separation.
 */

import type { IntelligenceFindingDTO } from '@/types/intelligenceFinding.types';

import './FactsInferenceLayout.css';

export interface FactsInferenceLayoutProps {
  finding: IntelligenceFindingDTO;
  compact?: boolean;
}

export function FactsInferenceLayout({
  finding,
  compact = false,
}: FactsInferenceLayoutProps): JSX.Element {
  return (
    <div className={compact ? 'hi-facts-layout hi-facts-layout--compact' : 'hi-facts-layout'}>
      {finding.facts.length > 0 && (
        <section className="hi-facts-layout__facts" aria-label="Observed facts">
          <h3>Facts</h3>
          <ul>
            {finding.facts.map((fact, index) => (
              <li key={fact.id ?? `fact-${index}`}>
                <span>{fact.text}</span>
                {fact.source && <span className="hi-facts-layout__source">{fact.source}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {finding.inferences.length > 0 && (
        <section className="hi-facts-layout__inference" aria-label="Inferences">
          <h3>Inference</h3>
          <ul>
            {finding.inferences.map((inf, index) => (
              <li key={inf.id ?? `inf-${index}`}>
                <span>{inf.text}</span>
                {inf.confidence != null && (
                  <span className="hi-facts-layout__confidence">
                    {inf.confidence.toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {finding.contradictions.length > 0 && (
        <section className="hi-facts-layout__contradiction" aria-label="Contradictions">
          <h3>Contradictions</h3>
          <ul>
            {finding.contradictions.map((item, index) => (
              <li key={item.id ?? `con-${index}`}>{item.text}</li>
            ))}
          </ul>
        </section>
      )}

      {finding.missingEvidence.length > 0 && (
        <section className="hi-facts-layout__gaps" aria-label="Missing evidence">
          <h3>Missing evidence</h3>
          <ul>
            {finding.missingEvidence.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
