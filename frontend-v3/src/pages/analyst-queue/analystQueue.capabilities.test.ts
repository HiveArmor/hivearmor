/**
 * analystQueue.capabilities — unit tests
 */

import { describe, it, expect } from 'vitest';

import {
  canAssignQueueAlerts,
  canTriageQueueAlerts,
  QUEUE_ASSIGN_DENIED,
  QUEUE_BULK_STATUS_SUPPORTED,
  QUEUE_TRIAGE_DENIED,
} from './analystQueue.capabilities';

describe('analystQueue.capabilities', () => {
  it('allows ALERT_MUTATION_AUTH roles to triage', () => {
    expect(canTriageQueueAlerts(['ROLE_ANALYST'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_SOC_ANALYST'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_ADMIN'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_USER'])).toBe(false);
    expect(canTriageQueueAlerts(null)).toBe(false);
  });

  it('gates assignment to SOC Manager or Platform Administrator', () => {
    expect(canAssignQueueAlerts(['ROLE_ANALYST'])).toBe(false);
    expect(canAssignQueueAlerts(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canAssignQueueAlerts(['ROLE_ADMIN'])).toBe(true);
  });

  it('uses human role labels on deny copy', () => {
    expect(QUEUE_TRIAGE_DENIED).toMatch(/^Required permission:/);
    expect(QUEUE_TRIAGE_DENIED).toContain('Analyst');
    expect(QUEUE_TRIAGE_DENIED).not.toMatch(/ROLE_/);
    expect(QUEUE_ASSIGN_DENIED).toBe('Required permission: SOC Manager');
  });

  it('marks bulk status as backend-supported', () => {
    expect(QUEUE_BULK_STATUS_SUPPORTED).toBe(true);
  });
});
