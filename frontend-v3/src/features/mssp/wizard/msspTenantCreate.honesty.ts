/** Bundle-visible job sentence — MSSP provisioning, not inventory or platform tenancy. */
export const NEW_TENANT_JOB_SENTENCE =
  'MSSP tenant provisioning — create an MSSP-managed customer record and initial Tenant Admin via POST /api/ha-mssp/tenants for MSSP Administrators. Tenant inventory on Tenants; platform boundaries on Identity & Tenancy — admin activation, index bootstrap, delegated membership governance, and immutable audit remain fail-closed until IAM contracts land.';

export const NEW_TENANT_PROVISION_FAIL_CLOSED_TITLE =
  'Successful POST creates ha_client, jhi_user, and ha_tenant_user rows — it does not activate the admin account, bootstrap OpenSearch indices, or imply PRODUCTION READY. UI navigates to tenant detail only after HTTP 201 with a persisted id.';

/** Governed tenant lifecycle / delegation contracts — not PRODUCTION READY from UI alone (IAM-005). */
export const MSSP_TENANT_LIFECYCLE_GOVERNANCE_LIVE = false;

/** IAM-005 — delegated membership, lifecycle governance, and immutable audit remain partial. */
export const MSSP_TENANT_IAM_GAP = 'IAM-005';

/** MSSP portal paths — local until ROUTES gains an MSSP section. */
export const MSSP_ROUTES = {
  OVERVIEW: '/mssp/overview',
  TENANTS: '/mssp/tenants',
  NEW_TENANT: '/mssp/tenants/new',
} as const;
