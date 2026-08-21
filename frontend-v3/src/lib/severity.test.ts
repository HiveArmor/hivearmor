/**
 * Severity helpers tests
 */

import { describe, it, expect } from 'vitest';

import {
  SEVERITY_LEVELS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  getSeverityLabel,
  getSeverityColor,
  getSeverityOrder,
  compareSeverity,
} from './severity';

describe('severity', () => {
  describe('constants', () => {
    it('SEVERITY_LEVELS contains all 5 levels', () => {
      expect(SEVERITY_LEVELS).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    });

    it('SEVERITY_COLORS maps to CSS custom properties', () => {
      expect(SEVERITY_COLORS.critical).toBe('var(--ha-severity-critical)');
      expect(SEVERITY_COLORS.high).toBe('var(--ha-severity-high)');
      expect(SEVERITY_COLORS.medium).toBe('var(--ha-severity-medium)');
      expect(SEVERITY_COLORS.low).toBe('var(--ha-severity-low)');
      expect(SEVERITY_COLORS.info).toBe('var(--ha-severity-info)');
    });

    it('SEVERITY_LABELS provides display names', () => {
      expect(SEVERITY_LABELS.critical).toBe('Critical');
      expect(SEVERITY_LABELS.high).toBe('High');
      expect(SEVERITY_LABELS.medium).toBe('Medium');
      expect(SEVERITY_LABELS.low).toBe('Low');
      expect(SEVERITY_LABELS.info).toBe('Info');
    });

    it('SEVERITY_ORDER descends from critical (5) to info (1)', () => {
      expect(SEVERITY_ORDER.critical).toBe(5);
      expect(SEVERITY_ORDER.high).toBe(4);
      expect(SEVERITY_ORDER.medium).toBe(3);
      expect(SEVERITY_ORDER.low).toBe(2);
      expect(SEVERITY_ORDER.info).toBe(1);
    });
  });

  describe('getSeverityLabel', () => {
    it('returns correct label for each severity', () => {
      expect(getSeverityLabel('critical')).toBe('Critical');
      expect(getSeverityLabel('high')).toBe('High');
      expect(getSeverityLabel('medium')).toBe('Medium');
      expect(getSeverityLabel('low')).toBe('Low');
      expect(getSeverityLabel('info')).toBe('Info');
    });
  });

  describe('getSeverityColor', () => {
    it('returns CSS custom property for each severity', () => {
      expect(getSeverityColor('critical')).toBe('var(--ha-severity-critical)');
      expect(getSeverityColor('high')).toBe('var(--ha-severity-high)');
      expect(getSeverityColor('medium')).toBe('var(--ha-severity-medium)');
      expect(getSeverityColor('low')).toBe('var(--ha-severity-low)');
      expect(getSeverityColor('info')).toBe('var(--ha-severity-info)');
    });
  });

  describe('getSeverityOrder', () => {
    it('returns order number for each severity', () => {
      expect(getSeverityOrder('critical')).toBe(5);
      expect(getSeverityOrder('high')).toBe(4);
      expect(getSeverityOrder('medium')).toBe(3);
      expect(getSeverityOrder('low')).toBe(2);
      expect(getSeverityOrder('info')).toBe(1);
    });
  });

  describe('compareSeverity', () => {
    it('returns positive when first severity is higher', () => {
      expect(compareSeverity('critical', 'high')).toBeGreaterThan(0);
      expect(compareSeverity('high', 'medium')).toBeGreaterThan(0);
      expect(compareSeverity('medium', 'low')).toBeGreaterThan(0);
      expect(compareSeverity('low', 'info')).toBeGreaterThan(0);
    });

    it('returns negative when first severity is lower', () => {
      expect(compareSeverity('high', 'critical')).toBeLessThan(0);
      expect(compareSeverity('medium', 'high')).toBeLessThan(0);
      expect(compareSeverity('low', 'medium')).toBeLessThan(0);
      expect(compareSeverity('info', 'low')).toBeLessThan(0);
    });

    it('returns 0 when severities are equal', () => {
      expect(compareSeverity('critical', 'critical')).toBe(0);
      expect(compareSeverity('high', 'high')).toBe(0);
      expect(compareSeverity('medium', 'medium')).toBe(0);
      expect(compareSeverity('low', 'low')).toBe(0);
      expect(compareSeverity('info', 'info')).toBe(0);
    });

    it('can be used to sort severity arrays descending', () => {
      const severities = ['low', 'critical', 'info', 'high', 'medium'] as const;
      const sorted = [...severities].sort(compareSeverity).reverse();
      expect(sorted).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    });
  });
});
