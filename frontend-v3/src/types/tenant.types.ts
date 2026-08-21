/**
 * tenant.types.ts — Tenant Management types
 * NOTE: These types are PLANNING ONLY. They do not map to any existing backend entity.
 */

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'DEPROVISIONED';

export interface TenantDTO {
  id: number;
  name: string;
  domain: string;
  prefix: string; // unique; used for data partitioning; immutable after creation
  status: TenantStatus;
  licenceExpire: string | null; // ISO 8601
  createdAt: string; // ISO 8601
}

export interface TenantUsageDTO {
  tenantId: number;
  storageUsedGB: number;
  eventsPerDayAvg: number; // trailing 24h average
  activeUserCount: number;
  alertCountLast24h: number;
  incidentCountOpen: number;
}

export interface TenantCreateDTO {
  name: string;
  domain: string;
  prefix: string; // 2–8 alphanumeric chars; immutable after creation
  adminUserLogin: string; // creates initial ROLE_ADMIN user for this tenant
  adminUserEmail: string;
  adminUserPassword: string; // write-only; masked; not stored after POST
  licenceKey: string | null; // optional
}
