/** Bundle-visible job sentence — MSSP fleet snapshot, not tenant directory or platform tenancy. */
export const MSSP_OVERVIEW_JOB_SENTENCE =
  'MSSP Overview — fleet health snapshot across managed customer tenants from GET /api/ha-mssp/overview for MSSP Administrators. Tenant directory and membership live on Tenants; platform tenant inventory on Identity & Tenancy — cross-tenant aggregate export is MSSP_ADMIN-gated; never infer live customer counts from placeholders.';

export const MSSP_OVERVIEW_AGGREGATE_FAIL_CLOSED_TITLE =
  'Cross-tenant aggregate export requires MSSP Administrator and a successful GET /api/ha-mssp/reports/aggregate response — simulated or placeholder counts are not shown.';

/** MSSP portal paths — local until ROUTES gains an MSSP section. */
export const MSSP_ROUTES = {
  OVERVIEW: '/mssp/overview',
  TENANTS: '/mssp/tenants',
  NEW_TENANT: '/mssp/tenants/new',
} as const;
