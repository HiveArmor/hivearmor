/**
 * Correlated findings / offenses status mutation capability gates (SEC-03).
 *
 * Backend truth (main):
 * - PUT /api/offenses/{id}/status — @PreAuthorize(ALERT_QUEUE_AUTH) + allowlisted Painless
 * - POST /api/ha-correlated-findings/{id}/status — @PreAuthorize(ALERT_QUEUE_AUTH) +
 *   allowlisted status scripts (FindingLifecycleService)
 *
 * STAGING CANDIDATE: UI may enable status mutations only when
 * {@link GAP_SEC_03_RESOLVED} is true AND the caller has a queue-tier role.
 * Unauthorized callers see a disabled control with an honest permission tooltip —
 * never an over-enabled mutate affordance.
 */

/** Flip remains true while backend status mutations stay @PreAuthorize'd + script-safe. */
export const GAP_SEC_03_RESOLVED = true;

/**
 * Roles matching backend ALERT_QUEUE_AUTH / INCIDENT_AUTH
 * (HaAlertQueueResource, HaCorrelatedFindingsResource, UtmIncidentResource, …).
 * ROLE_SOC_ANALYST is accepted by the backend; UI copy maps it to Analyst.
 */
export const ALERT_QUEUE_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
  'ROLE_ANALYST',
  'ROLE_SOC_ANALYST',
] as const;

/** Alias — status mutate uses the same queue-tier authority matrix. */
export const FINDING_STATUS_MUTATE_ROLES = ALERT_QUEUE_ROLES;

export function canMutateFindingStatus(roles: readonly string[] | undefined | null): boolean {
  if (!GAP_SEC_03_RESOLVED) {
    return false;
  }
  if (!roles || roles.length === 0) {
    return false;
  }
  return FINDING_STATUS_MUTATE_ROLES.some((role) => roles.includes(role));
}

/** Alias for legacy offenses.service callers — same gate as correlated findings. */
export function canUpdateOffenseStatus(roles: readonly string[] | undefined | null): boolean {
  return canMutateFindingStatus(roles);
}

export const FINDING_STATUS_SEC03_BLOCKED_TITLE =
  'Status changes stay blocked until SEC-03 backend authorization and script allowlisting are deployed';

export const FINDING_STATUS_ROLE_BLOCKED_TITLE =
  'Required permission: Platform Administrator, SOC Manager, or Analyst';

export function findingStatusBlockedTitle(roles: readonly string[] | undefined | null): string {
  if (!GAP_SEC_03_RESOLVED) {
    return FINDING_STATUS_SEC03_BLOCKED_TITLE;
  }
  if (!canMutateFindingStatus(roles)) {
    return FINDING_STATUS_ROLE_BLOCKED_TITLE;
  }
  return '';
}
