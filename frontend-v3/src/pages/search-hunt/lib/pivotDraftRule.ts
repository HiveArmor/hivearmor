import type { PivotDetectionContext } from './pivotDetectionContext';
import type { DetectionRule } from '../../detection-rules/detectionRules.types';

/**
 * P5 PR 2 step 5a (manual draft, NO LLM) — deterministically turn a captured Pivot detection context into a
 * DRAFT detection rule payload the analyst then edits and, later, submits for the EXISTING SOC-manager
 * review/approve flow. This builds a plain CEL equality on the two pivoted fields — a starting point, not a
 * finished rule — and stamps the reproduction context into the description as provenance (§30).
 *
 * <p>This function ONLY shapes a draft object. It performs no network call, drafts via no model, and creates
 * nothing — the caller passes the result to the existing `createRule` service, which writes `status=draft`.
 * There is no path from here to an active/deployed rule.
 */
export function buildDraftRuleFromContext(ctx: PivotDetectionContext): Omit<DetectionRule, 'id'> {
  const { rowField, colField, selectedCell } = ctx;
  // A deterministic CEL starting point: match events where both pivoted fields equal the selected members.
  const expression =
    `equals(${rowField}, ${JSON.stringify(selectedCell.row)}) && `
    + `equals(${colField}, ${JSON.stringify(selectedCell.col)})`;

  const sig = ctx.significant
    ? ` It was flagged as ${ctx.significant.direction}-represented (~${ctx.significant.ratio}× the expected ${ctx.significant.expected}).`
    : '';
  const description =
    `Draft from Investigation Pivot. Combination ${rowField}=${selectedCell.row} × ${colField}=${selectedCell.col} `
    + `(${selectedCell.value} ${ctx.measure.function}).${sig} `
    + `Source search ${ctx.searchId ?? 'n/a'} @ ${ctx.computedAt ?? 'n/a'}; query: ${ctx.query}. `
    + `DRAFT — requires SOC manager review and approval before it detects anything.`;

  return {
    ruleName: `Pivot draft — ${rowField}=${selectedCell.row} × ${colField}=${selectedCell.col}`,
    ruleDefinition: expression,
    description,
    severity: 'medium',
    ruleActive: false,           // never active from a draft
    dataTypes: [],
    sigmaRuleId: null,
    lastModified: new Date().toISOString(),
  };
}
