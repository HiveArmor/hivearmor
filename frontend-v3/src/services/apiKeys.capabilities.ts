/**
 * API key management capability gates (Wave C2 / Prompt 39 — STAGING CANDIDATE honesty).
 * List, create, and revoke are live on /api/ha-admin/api-keys/* for ROLE_ADMIN.
 */

/** GET/POST/DELETE /api/ha-admin/api-keys are live for Platform Administrators. */
export const API_KEY_CRUD_LIVE = true;

/** Rotation schedules and automated re-issue are not production-verified. */
export const API_KEY_ROTATION_POLICY_LIVE = false;

/** Scoped delegation (sub-keys, tenant-bound automation) is not available. */
export const API_KEY_DELEGATION_LIVE = false;

/** Immutable issuance audit ledger is not surfaced in UI. */
export const API_KEY_ISSUANCE_AUDIT_LIVE = false;

export const API_KEY_ACCESS_DENIED_TITLE = 'Required permission: Platform Administrator';
