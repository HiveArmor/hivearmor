/**
 * Suggested Pivots (P3 PR 1) — a DETERMINISTIC, heuristic "you might pivot on…" ranker.
 *
 * <p>No LLM, no AI provider needed. It ranks candidate axis pairs using the field intelligence we already
 * have (coverage %/cardinality per field, from the shipped field-stats endpoint) plus the curated template
 * catalogue, and emits a small set of ready-to-apply {@link HuntPivotConfig}s. Each suggestion is a
 * pre-filled definition the analyst applies via the SAME initialConfig path as templates — never auto-run.
 *
 * <p>Scoring rationale (all explainable, no magic):
 * <ul>
 *   <li>Both axes must be eligible in the live schema (reuses the shelf eligibility predicates).</li>
 *   <li>Prefer fields with USEFUL coverage — present enough to be meaningful, not so universal they're
 *       noise. A field in ~30-95% of events scores highest; very low coverage (sparse) is penalised.</li>
 *   <li>Prefer cardinality that fits the pivot — a handful to a few dozen distinct values. Cardinality
 *       far above the axis top-N cap is penalised (the pivot would truncate hard); cardinality of 1 is
 *       useless (a single bucket).</li>
 *   <li>Bonus when the pair matches a curated template (a known-interesting investigative combination).</li>
 * </ul>
 */

import { isTermAxisEligible } from './pivotAxisEligibility';
import { PIVOT_TEMPLATES } from './pivotTemplates';
import type { HuntFieldDefinition, HuntPivotConfig } from '../searchHunt.types';

export interface FieldStat { coverage: number | null; cardinality: number }

export interface SuggestedPivot {
  id: string;
  /** Human label, e.g. "user.name × host.name". */
  title: string;
  /** One-line, plain rationale for why this pivot is suggested (deterministic, from the stats). */
  rationale: string;
  /** The config to apply on click (validated axes; count measure). */
  config: HuntPivotConfig;
}

const AXIS_TOP_N = 50;

/** Score a single field as a pivot axis from its stats (0 = unusable). Higher is better. */
function scoreField(name: string, stats: Map<string, FieldStat>): number {
  const s = stats.get(name);
  if (!s) return 0;
  if (s.cardinality <= 1) return 0; // a single bucket is not a pivot
  let score = 0;

  // Coverage band: reward "present but not universal".
  const cov = s.coverage;
  if (cov == null) score += 1;                       // unknown coverage — mild
  else if (cov >= 30 && cov <= 95) score += 3;       // the useful band
  else if (cov > 95) score += 2;                     // very common — still fine
  else if (cov >= 10) score += 1;                    // low-ish
  // else < 10% (sparse) → +0

  // Cardinality band: reward a readable number of buckets.
  const card = s.cardinality;
  if (card >= 2 && card <= AXIS_TOP_N) score += 3;   // fits without truncation
  else if (card <= AXIS_TOP_N * 4) score += 1;       // truncates but still useful
  // else huge → +0

  return score;
}

/** True when this pair matches a curated template (known-interesting investigative combination). */
function matchesTemplate(rowField: string, colField: string): boolean {
  return PIVOT_TEMPLATES.some((t) => {
    const a = t.config.rowField;
    const b = t.config.colField;
    return (a === rowField && b === colField) || (a === colField && b === rowField);
  });
}

function coverageNote(name: string, stats: Map<string, FieldStat>): string {
  const s = stats.get(name);
  if (!s) return name;
  const parts: string[] = [];
  if (s.cardinality > 0) parts.push(`~${s.cardinality.toLocaleString()} values`);
  if (s.coverage != null) parts.push(`${s.coverage}% coverage`);
  return parts.length ? `${name} (${parts.join(', ')})` : name;
}

/**
 * Produce up to {@code limit} ranked pivot suggestions for the current schema + field stats.
 * Deterministic and stable: no stats (no search snapshot yet) → no suggestions.
 */
export function suggestPivots(
  fields: HuntFieldDefinition[],
  stats: Map<string, FieldStat>,
  tenantId: number | null,
  limit = 3,
): SuggestedPivot[] {
  if (stats.size === 0) return [];

  // Candidate axis fields: term-eligible AND scoring above zero.
  const scored = fields
    .filter((f) => isTermAxisEligible(f))
    .map((f) => ({ name: f.name, score: scoreField(f.name, stats) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length < 2) return [];

  // Build candidate pairs from the top-scoring fields (bounded — top 6 fields → at most 15 pairs).
  const top = scored.slice(0, 6);
  const pairs: { row: string; col: string; score: number }[] = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const templateBonus = matchesTemplate(top[i].name, top[j].name) ? 4 : 0;
      pairs.push({ row: top[i].name, col: top[j].name, score: top[i].score + top[j].score + templateBonus });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  return pairs.slice(0, limit).map((p, idx) => ({
    id: `suggest-${idx}-${p.row}-${p.col}`,
    title: `${p.row} × ${p.col}`,
    rationale: matchesTemplate(p.row, p.col)
      ? `A common investigative breakdown — ${coverageNote(p.row, stats)} against ${coverageNote(p.col, stats)}.`
      : `Both fields have useful coverage and a readable number of values — ${coverageNote(p.row, stats)} × ${coverageNote(p.col, stats)}.`,
    config: {
      v: 1,
      tenantId,
      rowField: p.row,
      colField: p.col,
      valueFn: 'count',
      distinctField: null,
      rowBucketInterval: null,
      colBucketInterval: null,
      rowMissing: 'omit',
      colMissing: 'omit',
    },
  }));
}
