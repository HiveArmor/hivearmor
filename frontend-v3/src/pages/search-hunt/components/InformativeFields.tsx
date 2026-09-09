import { TrendingUp } from 'lucide-react';

import type { InformativeField } from '../lib/pivotFieldInfoGain';

export interface InformativeFieldsProps {
  fields: InformativeField[];
  /** Apply a recommended field to an axis (fills the first empty axis; never auto-runs). */
  onApply: (field: string) => void;
}

/**
 * Item B — a compact "most informative fields" strip. Each chip is a deterministic recommendation of a field
 * that would usefully split the current result set (ranked by an entropy-proxy information-gain score from
 * the field-stats). Clicking a chip fills an axis — the analyst still runs it. Renders nothing when there
 * are no recommendations (no completed search). Intelligence token: analytic assistance, not a severity.
 */
export function InformativeFields({ fields, onApply }: InformativeFieldsProps): JSX.Element | null {
  if (fields.length === 0) return null;
  return (
    <div className="pivot-infogain" role="group" aria-label="Most informative fields">
      <span className="pivot-infogain__label"><TrendingUp size={13} aria-hidden="true" /> Most informative</span>
      {fields.map((f) => (
        <button
          key={f.field}
          type="button"
          className="pivot-infogain__chip"
          onClick={() => onApply(f.field)}
          title={f.rationale}
        >
          {f.field}
        </button>
      ))}
    </div>
  );
}
