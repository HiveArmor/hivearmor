/** Bundle-visible job sentence — governance audit evidence, not identity or enrollment audit. */
export const ADMIN_AUDIT_JOB_SENTENCE =
  'Governance audit — immutable platform evidence ledger from GET /api/ha-audit-log with ADMIN-only NDJSON export via GET /api/ha-audit-log/export. Identity audit lives on Identity & Tenancy; agent enrollment on Enrollment audit; retention and secret-safe settings on sibling governance routes — change control, legal holds and integrity proofs remain fail-closed until GOV contracts land.';

/** GOV-003 — async evidence export manifest/signature is not exposed. */
export const ADMIN_AUDIT_EXPORT_FAIL_CLOSED_TITLE =
  'Async evidence export with manifest and integrity verification remains unavailable until GOV-003 lands';

/** GOV-005/GOV-009 — retention and configuration mutations lack versioned governance. */
export const ADMIN_AUDIT_PROPOSE_FAIL_CLOSED_TITLE =
  'Retention revisions and configuration change proposals remain fail-closed until GOV-005 and GOV-009 publish versioned draft/approval contracts';
