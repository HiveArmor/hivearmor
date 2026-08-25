/**
 * Investigation promote / convert capability gates (STAGING CANDIDATE honesty).
 *
 * POST /api/ha-investigation-sessions/{id}/convert-to-incident is @Deprecated
 * (Deprecation + Sunset headers; Link successor promotion-preview is not mapped yet).
 * Keep fail-closed in live UI until the governed promotion contract ships.
 */

/** Live promote via deprecated convert endpoint — do not enable silently. */
export const INV_CONVERT_TO_INCIDENT = false;

export const INV_CONVERT_DISABLED_TITLE =
  'Incident promotion via convert-to-incident is deprecated; governed promotion-preview is not available yet';
