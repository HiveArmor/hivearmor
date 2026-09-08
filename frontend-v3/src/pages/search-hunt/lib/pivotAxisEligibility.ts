/**
 * Pivot axis eligibility — the single source of truth for whether a field may occupy a pivot axis.
 *
 * <p>Shared by {@link PivotShelves} (the builder menus) and {@link validatePivotTemplate} (template
 * apply-time validation) so the two never disagree about what is a legal axis. Mirrors the backend
 * field capability: a date field is axis-eligible only when bucketed (an interval is prompted in the UI);
 * a text field is eligible only when it is keyword-backed (has the ':' operator); other aggregatable
 * types are eligible. The server re-validates regardless.
 */

import type { HuntFieldDefinition } from '../searchHunt.types';

/** A date field — axis-eligible only once an interval is chosen (bucketed). Never a distinct-of field. */
export function isDateField(f: HuntFieldDefinition): boolean {
  return f.type === 'date';
}

/** A NON-date field that may occupy an axis: text-without-keyword is excluded; other types allowed. */
export function isTermAxisEligible(f: HuntFieldDefinition): boolean {
  if (f.type === 'date') return false;
  if (f.type === 'text' && !f.operators.includes(':')) return false;
  return true;
}

/** True when a field may occupy a pivot axis at all (term-eligible OR a date that will be bucketed). */
export function isAxisEligible(f: HuntFieldDefinition): boolean {
  return isTermAxisEligible(f) || isDateField(f);
}
