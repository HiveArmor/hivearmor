/**
 * msspMembershipApi — tenant user membership CRUD client.
 *
 * All paths use the Vite proxy (/api/*).
 * Zero `any` types.
 *
 * Requirements: 15.2, 15.5, 15.6, 17.4, 17.5
 */

import { MsspConflictError } from "./msspTypes";
import type {
  AddTenantMemberRequest,
  PatchTenantMemberRequest,
  TenantMemberDTO,
} from "./msspTypes";

// ---------------------------------------------------------------------------
// GET /api/ha-mssp/tenants/{tenantId}/users
// ---------------------------------------------------------------------------

export async function fetchTenantUsers(
  tenantId: string,
): Promise<readonly TenantMemberDTO[]> {
  const res = await fetch(`/api/ha-mssp/tenants/${tenantId}/users`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<readonly TenantMemberDTO[]>;
}

// ---------------------------------------------------------------------------
// POST /api/ha-mssp/tenants/{tenantId}/users
// Throws MsspConflictError on 409.
// ---------------------------------------------------------------------------

export async function addTenantUser(
  tenantId: string,
  body: AddTenantMemberRequest,
): Promise<TenantMemberDTO> {
  const res = await fetch(`/api/ha-mssp/tenants/${tenantId}/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    throw new MsspConflictError("userId", "User is already a member of this tenant.");
  }

  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<TenantMemberDTO>;
}

// ---------------------------------------------------------------------------
// DELETE /api/ha-mssp/tenants/{tenantId}/users/{userId}
// Expects 204 with no body.
// ---------------------------------------------------------------------------

export async function removeTenantUser(
  tenantId: string,
  userId: number,
): Promise<void> {
  const res = await fetch(`/api/ha-mssp/tenants/${tenantId}/users/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(String(res.status));
}

// ---------------------------------------------------------------------------
// PATCH /api/ha-mssp/tenants/{tenantId}/users/{userId}
// ---------------------------------------------------------------------------

export async function patchTenantUserRole(
  tenantId: string,
  userId: number,
  body: PatchTenantMemberRequest,
): Promise<TenantMemberDTO> {
  const res = await fetch(`/api/ha-mssp/tenants/${tenantId}/users/${userId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<TenantMemberDTO>;
}
