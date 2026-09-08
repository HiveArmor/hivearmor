import { describe, it, expect } from 'vitest';

import { buildDraftRuleFromContext } from './pivotDraftRule';
import type { PivotDetectionContext } from './pivotDetectionContext';

const ctx: PivotDetectionContext = {
  searchId: 'HUNT-1', computedAt: '2026-09-08T00:00:00Z',
  query: 'event.category:authentication',
  rowField: 'user.name', colField: 'host.name',
  measure: { function: 'count', distinctField: null },
  pivotFilters: [],
  selectedCell: { row: 'alice', col: 'RU', value: 40 },
  significant: { residual: 3.2, expected: 8, ratio: 5, direction: 'over' },
};

describe('buildDraftRuleFromContext', () => {
  it('produces a deterministic CEL equality on the two pivoted fields', () => {
    const draft = buildDraftRuleFromContext(ctx);
    expect(draft.ruleDefinition).toBe('equals(user.name, "alice") && equals(host.name, "RU")');
  });

  it('is a non-active DRAFT and stamps the reproduction context + significance into the description', () => {
    const draft = buildDraftRuleFromContext(ctx);
    expect(draft.ruleActive).toBe(false);          // never active from a draft
    expect(draft.severity).toBe('medium');
    expect(draft.description).toContain('HUNT-1');  // provenance
    expect(draft.description).toContain('over-represented');
    expect(draft.description).toMatch(/requires SOC manager review/i);
  });
});
