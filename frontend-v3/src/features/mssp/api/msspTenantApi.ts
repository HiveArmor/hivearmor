import type { NewTenantRequest, NewTenantResponse, TenantDetailDTO, TenantHealthDTO, UpdateTenantRequest } from "./msspTypes";
import { MsspConflictError } from "./msspTypes";

interface ProblemDetail {
  readonly field?: string;
  readonly title?: string;
  readonly detail?: string;
}

export async function fetchTenants(params: {
  q?: string;
  page?: number;
  size?: number;
}): Promise<{ items: readonly TenantHealthDTO[]; totalCount: number }> {
  const searchParams = new URLSearchParams();
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.size !== undefined) {
    searchParams.set("size", String(params.size));
  }

  const qs = searchParams.toString();
  const url = qs
    ? `/api/ha-mssp/tenants?${qs}`
    : "/api/ha-mssp/tenants";

  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  const totalCountHeader = response.headers.get("X-Total-Count");
  const totalCount = totalCountHeader !== null ? parseInt(totalCountHeader, 10) : 0;
  const items = (await response.json()) as TenantHealthDTO[];

  return { items, totalCount };
}

export async function createTenant(
  body: NewTenantRequest
): Promise<{ response: NewTenantResponse; locationHeader: string }> {
  const response = await fetch("/api/ha-mssp/tenants", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    let field = "clientPrefix";
    try {
      const problem = (await response.json()) as ProblemDetail;
      if (typeof problem.field === "string" && problem.field.length > 0) {
        field = problem.field;
      }
    } catch {
      // JSON parse failure — keep default field
    }
    throw new MsspConflictError(field, `Conflict on field: ${field}`);
  }

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  const locationHeader = response.headers.get("Location") ?? "";
  const data = (await response.json()) as NewTenantResponse;

  return { response: data, locationHeader };
}

export async function fetchTenantDetail(id: string): Promise<TenantDetailDTO> {
  const res = await fetch(`/api/ha-mssp/tenants/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<TenantDetailDTO>;
}

export async function updateTenant(id: string, body: UpdateTenantRequest): Promise<TenantDetailDTO> {
  const res = await fetch(`/api/ha-mssp/tenants/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<TenantDetailDTO>;
}
