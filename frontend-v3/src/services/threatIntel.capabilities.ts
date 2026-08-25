/**
 * threatIntel.capabilities.ts — TI-002–TI-004 STAGING CANDIDATE flags
 *
 * Not PRODUCTION READY. Documents auth/honesty boundaries for threat-intel ops.
 * Frontend must never call legacy `/api/v1/threat-intel` even after TI-003 harden.
 */

/** Feed list/get + stats authorize Admin|User|Analyst|SOC Manager explicitly (no ROLE_USER co-assignment reliance). */
export const TI_002_EXPLICIT_FEED_READ_ROLES = true;

/**
 * Legacy `/api/v1/threat-intel` has @PreAuthorize (harden in place).
 * Deprecation/Sunset/Link headers are NOT claimed — cutover incomplete.
 */
export const TI_003_LEGACY_V1_HARDENED = true;

/** TAXII/MISP sync returns ThreatFeedSyncReceipt (receiptId, lastSyncAt, status, iocCount, failedReason). */
export const TI_004_SYNC_RECEIPT = true;

/** Roles allowed to read feeds/stats/IOCs/lookup on the secured ha-threat-intel surface. */
export const THREAT_INTEL_READ_ROLES = [
  'ROLE_ADMIN',
  'ROLE_USER',
  'ROLE_ANALYST',
  'ROLE_SOC_MANAGER',
] as const;

/** Feed enable/sync and TAXII/MISP CRUD remain Platform Administrator only. */
export const THREAT_INTEL_MUTATE_ROLES = ['ROLE_ADMIN'] as const;

export function canReadThreatIntel(roles: readonly string[]): boolean {
  if (!TI_002_EXPLICIT_FEED_READ_ROLES) return false;
  return THREAT_INTEL_READ_ROLES.some((role) => roles.includes(role));
}

export function canMutateThreatIntelFeeds(roles: readonly string[]): boolean {
  return THREAT_INTEL_MUTATE_ROLES.some((role) => roles.includes(role));
}
