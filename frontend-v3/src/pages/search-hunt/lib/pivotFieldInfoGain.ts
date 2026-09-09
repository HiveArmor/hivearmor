import { isTermAxisEligible } from './pivotAxisEligibility';
import type { FieldStat } from './suggestedPivots';
import type { HuntFieldDefinition } from '../searchHunt.types';

/**
 * Item B — deterministic "most informative field" recommendations.
 *
 * <p>Where Suggested Pivots ranks READY PAIRS to start a pivot, this ranks SINGLE fields by how well each
 * would SPLIT / discriminate the current result set — a principled "best next axis" suggestion. It is
 * deterministic and explainable: NO LLM, NO new query. It scores from the field-stats we already fetch
 * (coverage % + cardinality), using a normalized-entropy proxy for information gain.
 *
 * <p>Intuition (honest, no magic): a field is informative when MOST events carry a value (high coverage)
 * AND it has enough distinct values to separate results into several well-populated buckets — but not so
 * many that every event is nearly unique (which over-splits and explains nothing). We approximate the
 * information a field carries as coverage × a cardinality-fit factor peaking in that readable band, and
 * label it plainly. This is a heuristic proxy, not a true per-value entropy over the raw events (which we
 * do not fetch); it is presented as a suggestion, never as a computed certainty.
 */
export interface InformativeField {
  field: string;
  /** 0..1 normalized informativeness (higher = would split results more usefully). */
  gain: number;
  /** Plain, deterministic rationale from the stats. */
  rationale: string;
}

const IDEAL_CARDINALITY = 12;   // a readable number of buckets to split into
const AXIS_TOP_N = 50;          // above this the pivot truncates hard → over-split penalty grows

/** Cardinality-fit factor in 0..1, peaking around IDEAL_CARDINALITY, low at 1 (no split) and huge (unique). */
function cardinalityFit(cardinality: number): number {
  if (cardinality <= 1) return 0;                 // a single bucket splits nothing
  // Log-distance from the ideal, gently penalised; clamps to 0..1.
  const ratio = cardinality <= IDEAL_CARDINALITY
    ? cardinality / IDEAL_CARDINALITY
    : IDEAL_CARDINALITY / Math.min(cardinality, AXIS_TOP_N * 10);
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Rank the term-eligible fields by informativeness for the current result set. Deterministic and stable;
 * returns [] when there are no stats yet (no completed search).
 */
export function rankInformativeFields(
  fields: HuntFieldDefinition[],
  stats: Map<string, FieldStat>,
  limit = 3,
): InformativeField[] {
  if (stats.size === 0) return [];

  return fields
    .filter((f) => isTermAxisEligible(f))
    .map((f) => {
      const s = stats.get(f.name);
      if (!s || s.cardinality <= 1) return null;
      const coverage = s.coverage == null ? 0.5 : s.coverage / 100;   // unknown coverage → neutral 0.5
      const fit = cardinalityFit(s.cardinality);
      const gain = Math.round(coverage * fit * 100) / 100;
      if (gain <= 0) return null;
      return {
        field: f.name,
        gain,
        rationale:
          `Splits your results into ~${s.cardinality.toLocaleString()} groups`
          + (s.coverage != null ? ` and is present in ${s.coverage}% of events` : '')
          + ' — a useful next breakdown.',
      } as InformativeField;
    })
    .filter((x): x is InformativeField => x !== null)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
}
