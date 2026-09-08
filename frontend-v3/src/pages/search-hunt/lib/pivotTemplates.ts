/**
 * Pivot templates (P1.1) — curated, built-in starting-point pivots an analyst applies with one click.
 *
 * <p>A template is READ-ONLY curated content, not user data: it carries no persistence and reuses the
 * exact {@code initialConfig} apply path that a loaded Saved Pivot uses. A template sets ONLY the pivot
 * axes/measure — it never touches the analyst's committed hunt query. Every template's fields are
 * validated against the live schema at apply time ({@link validatePivotTemplate}); an ineligible axis is
 * dropped (never applied broken), and a fully-inapplicable template is disabled in the picker.
 */

import { isDateField, isTermAxisEligible } from './pivotAxisEligibility';
import type { HuntFieldDefinition, HuntPivotConfig } from '../searchHunt.types';

export interface PivotTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  /** The axes/measure this template sets. Fields are validated against the live schema on apply. */
  config: {
    rowField: string | null;
    colField: string | null;
    valueFn: 'count' | 'distinct';
    distinctField?: string | null;
    rowBucketInterval?: string | null;
    colBucketInterval?: string | null;
    rowMissing?: 'omit' | 'include';
    colMissing?: 'omit' | 'include';
  };
}

/**
 * Curated seed set. Every field references a HuntFieldRegistry field. A template only sets axes/measure;
 * the analyst still scopes WHICH events via their own query.
 */
export const PIVOT_TEMPLATES: PivotTemplate[] = [
  {
    id: 'auth-user-host',
    name: 'Auth failures by user × host',
    description: 'User accounts against the hosts they touched — pair with an outcome=failure query.',
    category: 'Identity',
    config: { rowField: 'user.name', colField: 'host.name', valueFn: 'count' },
  },
  {
    id: 'traffic-country-port',
    name: 'Traffic by source country × destination port',
    description: 'Where connections originate against the ports they target.',
    category: 'Network',
    config: { rowField: 'source.geo.country_name', colField: 'destination.port', valueFn: 'count' },
  },
  {
    id: 'process-host-name',
    name: 'Process activity by host × process',
    description: 'Which processes ran on which hosts.',
    category: 'Endpoint',
    config: { rowField: 'host.name', colField: 'process.name', valueFn: 'count' },
  },
  {
    id: 'events-over-time-category',
    name: 'Events over time by category',
    description: 'Hourly event volume broken down by normalized category.',
    category: 'Overview',
    config: { rowField: '@timestamp', colField: 'event.category', valueFn: 'count', rowBucketInterval: '1h' },
  },
  {
    id: 'sources-dataset-outcome',
    name: 'Data sources by dataset × outcome',
    description: 'Which datasets are producing which action outcomes.',
    category: 'Overview',
    config: { rowField: 'data_stream.dataset', colField: 'event.outcome', valueFn: 'count' },
  },
  {
    id: 'distinct-users-per-host',
    name: 'Distinct users per host',
    description: 'How many distinct user accounts appear per host, by action.',
    category: 'Identity',
    config: { rowField: 'host.name', colField: 'event.action', valueFn: 'distinct', distinctField: 'user.name' },
  },
];

export interface TemplateApplyResult {
  /** The config to apply (ineligible axes dropped to null). */
  config: HuntPivotConfig;
  /** Human-readable notes about fields that were dropped because they are not in / eligible for this schema. */
  warnings: string[];
  /** True when NOTHING usable remains (both axes dropped) — the template should be disabled, not applied. */
  empty: boolean;
}

function fieldEligibleForAxis(name: string | null, fields: HuntFieldDefinition[]): boolean {
  if (!name) return false;
  const f = fields.find((fd) => fd.name === name);
  if (!f) return false;
  return isTermAxisEligible(f) || isDateField(f);
}

function fieldEligibleForDistinct(name: string | null | undefined, fields: HuntFieldDefinition[]): boolean {
  if (!name) return false;
  const f = fields.find((fd) => fd.name === name);
  return Boolean(f && isTermAxisEligible(f));
}

/**
 * Validate a template against the live schema and produce an applicable config. An axis field that is
 * absent or not axis-eligible is dropped (set null) with a warning — never applied as a broken pivot.
 * A distinct measure whose field is invalid falls back to count.
 */
export function validatePivotTemplate(
  template: PivotTemplate,
  fields: HuntFieldDefinition[],
  tenantId: number | null,
): TemplateApplyResult {
  const warnings: string[] = [];
  const c = template.config;

  const rowOk = fieldEligibleForAxis(c.rowField, fields);
  const colOk = fieldEligibleForAxis(c.colField, fields);
  if (c.rowField && !rowOk) warnings.push(`${c.rowField} isn't an eligible field in this schema — set the Rows axis yourself.`);
  if (c.colField && !colOk) warnings.push(`${c.colField} isn't an eligible field in this schema — set the Columns axis yourself.`);

  let valueFn = c.valueFn;
  let distinctField = c.distinctField ?? null;
  if (valueFn === 'distinct' && !fieldEligibleForDistinct(distinctField, fields)) {
    warnings.push(`${distinctField ?? 'the distinct field'} isn't available — falling back to a count.`);
    valueFn = 'count';
    distinctField = null;
  }

  const config: HuntPivotConfig = {
    v: 1,
    tenantId,
    rowField: rowOk ? c.rowField : null,
    colField: colOk ? c.colField : null,
    valueFn,
    distinctField,
    rowBucketInterval: rowOk ? (c.rowBucketInterval ?? null) : null,
    colBucketInterval: colOk ? (c.colBucketInterval ?? null) : null,
    rowMissing: c.rowMissing ?? 'omit',
    colMissing: c.colMissing ?? 'omit',
  };

  return { config, warnings, empty: !config.rowField && !config.colField };
}

/** True when at least one axis of the template is applicable to the current schema. */
export function isTemplateApplicable(template: PivotTemplate, fields: HuntFieldDefinition[]): boolean {
  return fieldEligibleForAxis(template.config.rowField, fields)
    || fieldEligibleForAxis(template.config.colField, fields);
}
