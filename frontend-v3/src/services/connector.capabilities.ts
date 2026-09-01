/**
 * Typed Connector SDK capability gates (Wave C2 / Prompt 38 — STAGING CANDIDATE honesty).
 * Vendor live connector proofs remain deferred until credentials and soak evidence exist.
 */

/** Catalog + instance CRUD + bounded test are live on /api/ha-connectors/*. */
export const CONNECTOR_SDK_INSTANCE_API = true;

/**
 * Vendor live credentials and outbound proofs are not production-verified.
 * Connection tests may succeed in dev without proving vendor contract completeness.
 */
export const CONNECTOR_VENDOR_LIVE_VERIFIED = false;

/**
 * Promote endpoints require ROLE_ADMIN only (SOC Manager may view staging queue).
 * Writes labeled v3-hive-connector-promoted-* docs — never v3-hive-alert-*.
 */
export const CONNECTOR_PROMOTE_ADMIN_ONLY = true;

/**
 * Vendor isolate via connector mesh is feature-flagged off by default
 * (hivearmor.connectors.vendor-isolate-enabled / HIVEARMOR_CONNECTOR_VENDOR_ISOLATE).
 */
export const CONNECTOR_VENDOR_ISOLATE_ENABLED = false;

/** fetch-alerts without persist=true is dry-run preview only. */
export const CONNECTOR_FETCH_ALERTS_DRY_RUN_ONLY = true;

export const CONNECTOR_VENDOR_LIVE_TITLE =
  'Vendor connector credentials are not production-verified — bounded tests and staging ingest only';

export const CONNECTOR_PROMOTE_DENIED_TITLE = 'Required permission: Platform Administrator';

export const CONNECTOR_INGEST_FAIL_CLOSED_TITLE =
  'Alert ingest to the PostgreSQL staging queue requires a saved instance and authorized mutate role';
