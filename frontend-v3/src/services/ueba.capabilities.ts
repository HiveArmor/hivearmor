/**
 * UEBA capability gates and honesty copy (STAGING CANDIDATE).
 *
 * Backend HaUebaResource requires ROLE_ANALYST | ROLE_SOC_MANAGER | ROLE_ADMIN.
 * Scoring is peer-group z-score against hourly metrics — not a trained model
 * in the event-processor, and not Hive Intelligence / SOC AI assist.
 */

export const UEBA_VIEW_ROLES = ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] as const;

export const UEBA_VIEW_DENIED_TITLE =
  'Required permission: Analyst, SOC Manager, or Platform Administrator';

export const UEBA_MODEL_HONESTY =
  'STAGING CANDIDATE — statistical peer-group z-score baselines in the HiveArmor backend. This is not a trained ML model in the event-processor, and Hive Intelligence / SOC AI is assist — not UEBA.';

export const UEBA_API_SCOPE_NOTE =
  'Operator UI reads only /api/ha-ueba/* (deviations, risk-scores, risk-trend, anomaly-counts, peer-groups, entity-timeline). Legacy /api/uba/* is not wired.';

export const UEBA_ALERT_PIVOT_NOTE =
  'Deviation rows do not include alert IDs. Hunt by user identifier. A synthetic alert is emitted only when summed points exceed 75.';

export const UEBA_TOTAL_SCORE_THRESHOLD = 75;

export function canViewUeba(roles: readonly string[] | undefined): boolean {
  const granted = roles ?? [];
  return granted.some((role) => (UEBA_VIEW_ROLES as readonly string[]).includes(role));
}

export function uebaHuntQuery(userId: string): string {
  return `user.name:"${userId.replace(/"/g, '\\"')}"`;
}

export function uebaEntityDossierPath(userId: string): string {
  return `/entities/${encodeURIComponent(userId)}/dossier`;
}

export function uebaTimelinePath(userId: string): string {
  return `/ueba/entity-timeline?userId=${encodeURIComponent(userId)}`;
}

export function uebaHuntPath(userId: string): string {
  return `/search?q=${encodeURIComponent(uebaHuntQuery(userId))}`;
}
