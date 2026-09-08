import { describe, it, expect } from 'vitest';

import type { HuntFieldDefinition } from '../searchHunt.types';
import {
  PIVOT_TEMPLATES,
  validatePivotTemplate,
  isTemplateApplicable,
  type PivotTemplate,
} from './pivotTemplates';

const fields: HuntFieldDefinition[] = [
  { name: 'user.name', label: 'User', type: 'keyword', category: 'identity', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'host.name', label: 'Host', type: 'keyword', category: 'host', description: '', operators: [':', '!='], coverage: 100 },
  { name: 'event.action', label: 'Action', type: 'keyword', category: 'event', description: '', operators: [':', '!='], coverage: 100 },
  { name: '@timestamp', label: 'Timestamp', type: 'date', category: 'event', description: '', operators: [':', '>', '<'], coverage: 100 },
];

describe('pivotTemplates catalogue', () => {
  it('every template names at least one axis field and uses a valid measure', () => {
    for (const t of PIVOT_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.config.rowField || t.config.colField).toBeTruthy();
      expect(['count', 'distinct']).toContain(t.config.valueFn);
      if (t.config.valueFn === 'distinct') expect(t.config.distinctField).toBeTruthy();
    }
  });

  it('template ids are unique', () => {
    const ids = PIVOT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('validatePivotTemplate', () => {
  const template: PivotTemplate = {
    id: 'test', name: 'T', description: '', category: 'X',
    config: { rowField: 'user.name', colField: 'host.name', valueFn: 'count' },
  };

  it('applies a fully-valid template unchanged with no warnings', () => {
    const r = validatePivotTemplate(template, fields, 7);
    expect(r.config.rowField).toBe('user.name');
    expect(r.config.colField).toBe('host.name');
    expect(r.config.tenantId).toBe(7);
    expect(r.warnings).toHaveLength(0);
    expect(r.empty).toBe(false);
  });

  it('drops an axis whose field is absent from the schema, with a warning', () => {
    const t: PivotTemplate = { ...template, config: { rowField: 'nonexistent.field', colField: 'host.name', valueFn: 'count' } };
    const r = validatePivotTemplate(t, fields, null);
    expect(r.config.rowField).toBeNull();      // dropped
    expect(r.config.colField).toBe('host.name'); // kept
    expect(r.warnings.join(' ')).toMatch(/nonexistent\.field/);
    expect(r.empty).toBe(false);
  });

  it('falls back to count when a distinct field is not available', () => {
    const t: PivotTemplate = { ...template, config: { rowField: 'host.name', colField: 'event.action', valueFn: 'distinct', distinctField: 'nope.field' } };
    const r = validatePivotTemplate(t, fields, null);
    expect(r.config.valueFn).toBe('count');
    expect(r.config.distinctField).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/falling back to a count/i);
  });

  it('reports empty when no axis is applicable', () => {
    const t: PivotTemplate = { ...template, config: { rowField: 'a.b', colField: 'c.d', valueFn: 'count' } };
    const r = validatePivotTemplate(t, fields, null);
    expect(r.empty).toBe(true);
    expect(isTemplateApplicable(t, fields)).toBe(false);
  });

  it('never touches the committed query — it only produces a HuntPivotConfig', () => {
    const r = validatePivotTemplate(template, fields, null);
    expect(r.config).not.toHaveProperty('query');
  });
});
