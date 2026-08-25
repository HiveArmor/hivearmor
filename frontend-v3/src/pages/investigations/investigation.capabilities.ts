/**
 * Investigation promote / convert capability gates (STAGING CANDIDATE honesty).
 *
 * INV-012 governed path: POST .../promotion-preview + POST .../promote (previewToken).
 * Deprecated POST .../convert-to-incident stays disabled in the UI.
 */

/** Deprecated direct convert — never enable silently. */
export const INV_CONVERT_TO_INCIDENT = false;

/** Governed preview + promote (INV-012) — flip only when backend endpoints are secured and live. */
export const INV_GOVERNED_PROMOTION = true;

export const INV_CONVERT_DISABLED_TITLE =
  'Incident promotion via convert-to-incident is deprecated; use governed promotion-preview';

export const INV_PROMOTION_DISABLED_TITLE =
  'Governed investigation promotion is not available from the backend yet';
