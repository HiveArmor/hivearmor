/**
 * Analyst Queue mutation gates — aligned with backend @PreAuthorize.
 *
 * Status / notes / convert: UtmAlertResource ALERT_MUTATION_AUTH
 *   ROLE_SOC_ANALYST | ROLE_ANALYST | ROLE_SOC_MANAGER | ROLE_ADMIN
 * Assignment: HaAlertAssignmentResource ASSIGNMENT_AUTH
 *   ROLE_SOC_MANAGER | ROLE_ADMIN
 *
 * STAGING CANDIDATE — human role labels only in deny copy.
 */

import { ROLE_LABELS, ROLES } from '@/lib/roles';
import {
  DET_EXCEPTION_ACTIVATE_DENIED_TITLE,
  DET_EXCEPTION_DRAFT_DENIED_TITLE,
} from '@/pages/detection-rules/detectionRules.capabilities';
import { ALERT_QUEUE_ROLES } from '@/services/findingStatus.capabilities';

export const QUEUE_TRIAGE_ROLES = ALERT_QUEUE_ROLES;

export const QUEUE_ASSIGN_ROLES = [ROLES.SOC_MANAGER, ROLES.ADMIN] as const;

export function canTriageQueueAlerts(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false;
  return QUEUE_TRIAGE_ROLES.some((role) => roles.includes(role));
}

export function canAssignQueueAlerts(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false;
  return QUEUE_ASSIGN_ROLES.some((role) => roles.includes(role));
}

export const QUEUE_TRIAGE_DENIED =
  `Required permission: ${ROLE_LABELS.ROLE_ANALYST}, ${ROLE_LABELS.ROLE_SOC_MANAGER}, or ${ROLE_LABELS.ROLE_ADMIN}`;

export const QUEUE_ASSIGN_DENIED = `Required permission: ${ROLE_LABELS.ROLE_SOC_MANAGER}`;

/** DET-FP-002 — Analyst+ may save a detection exception draft from triage. */
export function canDraftQueueException(roles: readonly string[] | undefined | null): boolean {
  return canTriageQueueAlerts(roles);
}

/** DET-FP-002 — SOC Manager+ may activate a drafted exception. */
export function canActivateQueueException(roles: readonly string[] | undefined | null): boolean {
  return canAssignQueueAlerts(roles);
}

export const QUEUE_EXCEPTION_DRAFT_DENIED = DET_EXCEPTION_DRAFT_DENIED_TITLE;

export const QUEUE_EXCEPTION_ACTIVATE_DENIED = DET_EXCEPTION_ACTIVATE_DENIED_TITLE;

/** Bulk status via POST /api/ha-alerts/status (alertIds[]) — real backend contract. */
export const QUEUE_BULK_STATUS_SUPPORTED = true;

export const QUEUE_JOB_SENTENCE = 'Triage open alerts for this shift';
