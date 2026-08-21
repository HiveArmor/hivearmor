/**
 * alertFilterFields tests
 */

import { describe, it, expect } from 'vitest';

import {
  ALERT_FILTER_FIELDS,
  getAlertQuerySuggestions,
  parseAlertQueryExpression,
  parseKqlToParams,
} from './alertFilterFields';

describe('ALERT_FILTER_FIELDS', () => {
  it('should have all required fields', () => {
    expect(ALERT_FILTER_FIELDS.length).toBeGreaterThan(0);
    ALERT_FILTER_FIELDS.forEach((field) => {
      expect(field.field).toBeTruthy();
      expect(field.label).toBeTruthy();
      expect(field.paramKey).toBeTruthy();
      expect(field.valueType).toBeTruthy();
    });
  });

  it('should include severity field with enum values', () => {
    const severity = ALERT_FILTER_FIELDS.find((f) => f.field === 'severity');
    expect(severity).toBeDefined();
    expect(severity?.valueType).toBe('enum');
    expect(severity?.enumValues).toBeDefined();
    expect(severity?.enumValues?.length).toBeGreaterThan(0);
  });
});

describe('parseKqlToParams', () => {
  it('should return empty object for empty input', () => {
    expect(parseKqlToParams('')).toEqual({});
    expect(parseKqlToParams('   ')).toEqual({});
  });

  it('should parse single field:value expression', () => {
    const result = parseKqlToParams('severity:critical');
    expect(result).toEqual({ severity: 'critical' });
  });

  it('should parse multiple AND-separated expressions', () => {
    const result = parseKqlToParams('severity:critical AND status:open');
    expect(result).toEqual({ severity: 'critical', status: 'open' });
  });

  it('should handle quoted values', () => {
    const result = parseKqlToParams('title:"brute force"');
    expect(result).toEqual({ q: 'brute force' });
  });

  it('should return null for unknown field', () => {
    const result = parseKqlToParams('unknownfield:value');
    expect(result).toBeNull();
  });

  it('should return null for invalid syntax (no colon)', () => {
    const result = parseKqlToParams('invalidexpression');
    expect(result).toBeNull();
  });

  it('should handle adversary.networkId field', () => {
    const result = parseKqlToParams('adversary.networkId:192.168.1.1');
    expect(result).toEqual({ adversaryIp: '192.168.1.1' });
  });

  it('should handle case-insensitive AND', () => {
    const result = parseKqlToParams('severity:high and status:open');
    expect(result).toEqual({ severity: 'high', status: 'open' });
  });

  it('preserves Boolean expressions that require server-side evaluation', () => {
    expect(parseKqlToParams('severity:critical OR severity:high')).toEqual({
      queryExpression: 'severity:critical OR severity:high',
    });
    expect(parseKqlToParams('NOT status:false_positive')).toEqual({
      queryExpression: 'NOT status:false_positive',
    });
  });
});

describe('alert query intelligence', () => {
  it('parses mixed AND and OR clauses without losing join order', () => {
    expect(parseAlertQueryExpression('severity:critical OR severity:high AND status:open')).toEqual({
      clauses: [
        { field: 'severity', paramKey: 'severity', value: 'critical', negated: false, contains: false },
        { field: 'severity', paramKey: 'severity', value: 'high', negated: false, contains: false },
        { field: 'status', paramKey: 'status', value: 'open', negated: false, contains: false },
      ],
      joins: ['OR', 'AND'],
    });
  });

  it('offers field, enum value, and Boolean operator completions', () => {
    expect(getAlertQuerySuggestions('sev').map((item) => item.nextValue)).toContain('severity:');
    expect(getAlertQuerySuggestions('severity:cr').map((item) => item.nextValue)).toContain('severity:critical');
    expect(getAlertQuerySuggestions('severity:critical').map((item) => item.label)).toEqual(['AND', 'OR']);
  });
});
