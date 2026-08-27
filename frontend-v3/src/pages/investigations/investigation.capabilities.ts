/**
 * Investigation promote / convert capability gates (STAGING CANDIDATE honesty).
 *
 * INV-012 governed path: POST .../promotion-preview + POST .../promote (previewToken).
 * Deprecated POST .../convert-to-incident stays disabled in the UI.
 */

import { ROLE_LABELS, ROLES } from '@/lib/roles';

/** Deprecated direct convert — never enable silently. */
export const INV_CONVERT_TO_INCIDENT = false;

/** Governed preview + promote (INV-012) — flip only when backend endpoints are secured and live. */
export const INV_GOVERNED_PROMOTION = true;

export const INV_CONVERT_DISABLED_TITLE =
  'Incident promotion via convert-to-incident is deprecated; use governed promotion-preview';

export const INV_PROMOTION_DISABLED_TITLE =
  'Governed investigation promotion is not available from the backend yet';

/** Human deny copy for INV-012 promote (Analyst+). Never expose ROLE_* constants in UI. */
export const INV_PROMOTE_DENIED =
  `Required permission: ${ROLE_LABELS[ROLES.ANALYST]}, ${ROLE_LABELS[ROLES.SOC_MANAGER]}, or ${ROLE_LABELS[ROLES.ADMIN]}`;

export const INV_PROMOTE_ROLES = [ROLES.ANALYST, ROLES.SOC_MANAGER, ROLES.ADMIN, 'ROLE_SOC_ANALYST'] as const;
