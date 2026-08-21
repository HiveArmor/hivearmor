export interface TenantHealthDTO {
  readonly id: number;
  readonly name: string;
  readonly clientPrefix: string;
  readonly userCount: number;
  readonly eps: number;
  readonly healthStatus: "HEALTHY" | "DEGRADED" | "OFFLINE";
  readonly lastEventAt: string | null;
}

export interface MsspOverviewDTO {
  readonly tenantCount: number;
  readonly activeUserCount: number;
  readonly totalEps: number;
  readonly alertsToday: number;
  readonly tenants: readonly TenantHealthDTO[];
}

export interface NewTenantRequest {
  readonly name: string;
  readonly clientPrefix: string;
  readonly adminEmail: string;
  readonly adminLogin: string;
  readonly maxUsers: number;
  readonly licenceType: string;
}

export interface NewTenantResponse {
  readonly id: number;
  readonly name: string;
  readonly clientPrefix: string;
  readonly adminLogin: string;
  readonly createdAt: string;
}

export interface TenantDetailDTO {
  readonly id: number;
  readonly name: string;
  readonly clientPrefix: string;
  readonly maxUsers: number;
  readonly licenceType: string;
  readonly contactEmail: string | null;
  readonly userCount: number;
  readonly eps: number;
  readonly epsSparkline: readonly number[];   // 60 elements
  readonly alertsTrend7d: readonly number[]; // 7 elements
}

export interface UpdateTenantRequest {
  readonly name: string;
  readonly maxUsers: number;
  readonly licenceType: string;
  readonly contactEmail: string;
}

export interface TenantMemberDTO {
  readonly tenantUserId: number;
  readonly userId: number;
  readonly login: string;
  readonly email: string;
  readonly tenantRole: "TENANT_ADMIN" | "TENANT_ANALYST" | "TENANT_VIEWER";
  readonly userActivated: boolean;
}

export interface AddTenantMemberRequest {
  readonly userId: number;
  readonly tenantRole: "TENANT_ADMIN" | "TENANT_ANALYST" | "TENANT_VIEWER";
}

export interface PatchTenantMemberRequest {
  readonly tenantRole: "TENANT_ADMIN" | "TENANT_ANALYST" | "TENANT_VIEWER";
}

export class MsspConflictError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "MsspConflictError";
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// Tenant membership types
// ---------------------------------------------------------------------------

export type TenantRole = "TENANT_ADMIN" | "TENANT_ANALYST" | "TENANT_VIEWER";

export interface TenantMemberDTO {
  readonly tenantUserId: number;
  readonly userId: number;
  readonly login: string;
  readonly email: string;
  readonly tenantRole: TenantRole;
  readonly userActivated: boolean;
}

export interface AddTenantMemberRequest {
  readonly userId: number;
  readonly tenantRole: TenantRole;
}

export interface PatchTenantMemberRequest {
  readonly tenantRole: TenantRole;
}
