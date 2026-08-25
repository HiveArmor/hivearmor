import { describe, expect, it } from 'vitest';

import {
  FINDING_STATUS_MUTATE_ROLES,
  FINDING_STATUS_ROLE_BLOCKED_TITLE,
  FINDING_STATUS_SEC03_BLOCKED_TITLE,
  GAP_SEC_03_RESOLVED,
  canMutateFindingStatus,
  canUpdateOffenseStatus,
  findingStatusBlockedTitle,
} from './findingStatus.capabilities';

describe('findingStatus.capabilities (SEC-03)', () => {
  it('documents SEC-03 as resolved STAGING CANDIDATE', () => {
    expect(GAP_SEC_03_RESOLVED).toBe(true);
  });

  it('allows queue-tier roles matching backend ALERT_QUEUE_AUTH', () => {
    for (const role of FINDING_STATUS_MUTATE_ROLES) {
      expect(canMutateFindingStatus([role])).toBe(true);
      expect(canUpdateOffenseStatus([role])).toBe(true);
    }
  });

  it('denies non-queue roles and empty role sets', () => {
    expect(canMutateFindingStatus(['ROLE_USER'])).toBe(false);
    expect(canMutateFindingStatus(['ROLE_READ_ONLY'])).toBe(false);
    expect(canMutateFindingStatus(['ROLE_THREAT_HUNTER'])).toBe(false);
    expect(canMutateFindingStatus([])).toBe(false);
    expect(canMutateFindingStatus(undefined)).toBe(false);
    expect(canMutateFindingStatus(null)).toBe(false);
  });

  it('exposes honest blocked copy for role denial (not ROLE_ constants)', () => {
    expect(findingStatusBlockedTitle(['ROLE_USER'])).toBe(FINDING_STATUS_ROLE_BLOCKED_TITLE);
    expect(FINDING_STATUS_ROLE_BLOCKED_TITLE).toContain('Platform Administrator');
    expect(FINDING_STATUS_ROLE_BLOCKED_TITLE).toContain('SOC Manager');
    expect(FINDING_STATUS_ROLE_BLOCKED_TITLE).toContain('Analyst');
    expect(FINDING_STATUS_ROLE_BLOCKED_TITLE).not.toContain('ROLE_');
    expect(findingStatusBlockedTitle(['ROLE_ANALYST'])).toBe('');
    expect(FINDING_STATUS_SEC03_BLOCKED_TITLE).toContain('SEC-03');
  });
});
