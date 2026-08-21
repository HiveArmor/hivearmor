/**
 * Status helpers tests
 */

import { describe, it, expect } from 'vitest';

import {
  ALERT_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  getStatusLabel,
  getStatusColor,
  isTerminalStatus,
  isActiveStatus,
} from './status';

describe('status', () => {
  describe('constants', () => {
    it('ALERT_STATUSES contains all 5 statuses', () => {
      expect(ALERT_STATUSES).toEqual([
        'open',
        'in_progress',
        'resolved',
        'closed',
        'false_positive',
      ]);
    });

    it('STATUS_COLORS maps to CSS custom properties', () => {
      expect(STATUS_COLORS.open).toBe('var(--ha-status-open)');
      expect(STATUS_COLORS.in_progress).toBe('var(--ha-status-in-progress)');
      expect(STATUS_COLORS.resolved).toBe('var(--ha-status-resolved)');
      expect(STATUS_COLORS.closed).toBe('var(--ha-status-closed)');
      expect(STATUS_COLORS.false_positive).toBe('var(--ha-status-false-positive)');
    });

    it('STATUS_LABELS provides display names', () => {
      expect(STATUS_LABELS.open).toBe('Open');
      expect(STATUS_LABELS.in_progress).toBe('In Progress');
      expect(STATUS_LABELS.resolved).toBe('Resolved');
      expect(STATUS_LABELS.closed).toBe('Closed');
      expect(STATUS_LABELS.false_positive).toBe('False Positive');
    });
  });

  describe('getStatusLabel', () => {
    it('returns correct label for each status', () => {
      expect(getStatusLabel('open')).toBe('Open');
      expect(getStatusLabel('in_progress')).toBe('In Progress');
      expect(getStatusLabel('resolved')).toBe('Resolved');
      expect(getStatusLabel('closed')).toBe('Closed');
      expect(getStatusLabel('false_positive')).toBe('False Positive');
    });
  });

  describe('getStatusColor', () => {
    it('returns CSS custom property for each status', () => {
      expect(getStatusColor('open')).toBe('var(--ha-status-open)');
      expect(getStatusColor('in_progress')).toBe('var(--ha-status-in-progress)');
      expect(getStatusColor('resolved')).toBe('var(--ha-status-resolved)');
      expect(getStatusColor('closed')).toBe('var(--ha-status-closed)');
      expect(getStatusColor('false_positive')).toBe('var(--ha-status-false-positive)');
    });
  });

  describe('isTerminalStatus', () => {
    it('returns true for resolved and closed', () => {
      expect(isTerminalStatus('resolved')).toBe(true);
      expect(isTerminalStatus('closed')).toBe(true);
    });

    it('returns false for open, in_progress, and false_positive', () => {
      expect(isTerminalStatus('open')).toBe(false);
      expect(isTerminalStatus('in_progress')).toBe(false);
      expect(isTerminalStatus('false_positive')).toBe(false);
    });
  });

  describe('isActiveStatus', () => {
    it('returns true for open and in_progress', () => {
      expect(isActiveStatus('open')).toBe(true);
      expect(isActiveStatus('in_progress')).toBe(true);
    });

    it('returns false for resolved, closed, and false_positive', () => {
      expect(isActiveStatus('resolved')).toBe(false);
      expect(isActiveStatus('closed')).toBe(false);
      expect(isActiveStatus('false_positive')).toBe(false);
    });
  });
});
