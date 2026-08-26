/**
 * msspMembershipApi — tenant user membership CRUD client.
 *
 * All paths use the Vite proxy (/api/*) with Bearer JWT via msspFetch.
 */

import { msspFetch, msspHttpError } from "./msspFetch";
import { MsspConflictError } from "./msspTypes";
import type {
  AddTenantMemberRequest,
  PatchTenantMemberRequest,
  TenantMemberDTO,
} from "./msspTypes";

export async function fetchTenantUsers(
  tenantId: string,
): Promise<readonly TenantMemberDTO[]> {
  const res = await msspFetch(`/api/ha-mssp/tenants/${tenantId}/users`);
  if (!res.ok) throw msspHttpError(res.status);
  return res.json() as Promise<readonly TenantMemberDTO[]>;
}

export async function addTenantUser(
  tenantId: string,
  body: AddTenantMemberRequest,
): Promise<TenantMemberDTO> {
  const res = await msspFetch(`/api/ha-mssp/tenants/${tenantId}/users`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    throw new MsspConflictError("userId", "User is already a member of this tenant.");
  }

  if (!res.ok) throw msspHttpError(res.status);
  return res.json() as Promise<TenantMemberDTO>;
}

export async function removeTenantUser(
  tenantId: string,
  userId: number,
): Promise<void> {
  const res = await msspFetch(`/api/ha-mssp/tenants/${tenantId}/users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw msspHttpError(res.status);
}

export async function patchTenantUserRole(
  tenantId: string,
  userId: number,
  body: PatchTenantMemberRequest,
): Promise<TenantMemberDTO> {
  const res = await msspFetch(`/api/ha-mssp/tenants/${tenantId}/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw msspHttpError(res.status);
  return res.json() as Promise<TenantMemberDTO>;
}
