/**
 * threatIntel.capabilities.test.ts — TI-002–TI-004 capability honesty
 */

import { describe, expect, it } from 'vitest';

import {
  TI_002_EXPLICIT_FEED_READ_ROLES,
  TI_003_LEGACY_V1_HARDENED,
  TI_004_SYNC_RECEIPT,
  canMutateThreatIntelFeeds,
  canReadThreatIntel,
} from './threatIntel.capabilities';

describe('threatIntel.capabilities (STAGING CANDIDATE)', () => {
  it('documents TI-002 explicit feed-read roles as resolved', () => {
    expect(TI_002_EXPLICIT_FEED_READ_ROLES).toBe(true);
    expect(canReadThreatIntel(['ROLE_ANALYST'])).toBe(true);
    expect(canReadThreatIntel(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canReadThreatIntel(['ROLE_USER'])).toBe(true);
    expect(canReadThreatIntel(['ROLE_ADMIN'])).toBe(true);
    expect(canReadThreatIntel(['ROLE_READ_ONLY'])).toBe(false);
  });

  it('keeps feed mutations Admin-only', () => {
    expect(canMutateThreatIntelFeeds(['ROLE_ADMIN'])).toBe(true);
    expect(canMutateThreatIntelFeeds(['ROLE_ANALYST'])).toBe(false);
    expect(canMutateThreatIntelFeeds(['ROLE_SOC_MANAGER'])).toBe(false);
  });

  it('documents TI-003 legacy v1 harden without claiming deprecation cutover', () => {
    expect(TI_003_LEGACY_V1_HARDENED).toBe(true);
  });

  it('documents TI-004 thin sync receipt as staging candidate', () => {
    expect(TI_004_SYNC_RECEIPT).toBe(true);
  });
});
