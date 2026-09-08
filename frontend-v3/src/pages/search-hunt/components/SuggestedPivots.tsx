import { Lightbulb } from 'lucide-react';

import type { SuggestedPivot } from '../lib/suggestedPivots';

export interface SuggestedPivotsProps {
  suggestions: SuggestedPivot[];
  /** Apply a suggested pivot (fills the shelves via the parent's config apply path; never auto-runs). */
  onApply: (s: SuggestedPivot) => void;
}

/**
 * Suggested Pivots (P3 PR 1): a deterministic "you might pivot on…" strip. Each chip applies a ready-made
 * pivot definition the analyst then runs. Renders nothing when there are no suggestions (no search snapshot
 * yet). Uses the intelligence token for the lamp glyph — this is analytic assistance, not a severity.
 */
export function SuggestedPivots({ suggestions, onApply }: SuggestedPivotsProps): JSX.Element | null {
  if (suggestions.length === 0) return null;
  return (
    <div className="pivot-suggestions" role="group" aria-label="Suggested pivots">
      <span className="pivot-suggestions__label"><Lightbulb size={13} aria-hidden="true" /> Suggested</span>
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          className="pivot-suggestions__chip"
          onClick={() => onApply(s)}
          title={s.rationale}
        >
          {s.title}
        </button>
      ))}
    </div>
  );
}
