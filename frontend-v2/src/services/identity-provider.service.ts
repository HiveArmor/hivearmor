import { api } from "@/lib/api";

export type ProviderType = "GOOGLE" | "KEYCLOAK" | "OKTA" | "MICROSOFT";

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  GOOGLE:    "Google",
  KEYCLOAK:  "Keycloak",
  OKTA:      "Okta",
  MICROSOFT: "Microsoft",
};

export interface IdentityProvider {
  id?: number;
  name: string;
  providerType: ProviderType;
  metadataUrl: string;
  spEntityId: string;
  spAcsUrl: string;
  spCertificatePem?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IdentityProviderFormData {
  name: string;
  providerType: ProviderType;
  metadataUrl: string;
  spEntityId: string;
  spAcsUrl: string;
  active: boolean;
  spPrivateKeyFile?: File;
  spCertificateFile?: File;
}

// Always use relative URLs — this service is only called from "use client" pages.
const API_BASE = "";

function getAuthHeader(): Record<string, string> {
  const token = api.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildFormData(data: IdentityProviderFormData): FormData {
  const fd = new FormData();
  fd.append("name", data.name);
  fd.append("providerType", data.providerType);
  fd.append("metadataUrl", data.metadataUrl);
  fd.append("spEntityId", data.spEntityId);
  fd.append("spAcsUrl", data.spAcsUrl);
  fd.append("active", String(data.active));
  if (data.spPrivateKeyFile) fd.append("spPrivateKeyFile", data.spPrivateKeyFile);
  if (data.spCertificateFile) fd.append("spCertificateFile", data.spCertificateFile);
  return fd;
}

async function multipartRequest<T>(method: string, path: string, fd: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getAuthHeader(),
    body: fd,
  });
  if (res.status === 401) {
    api.clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const appError = res.headers.get("x-hivearmor-error") || res.headers.get("X-app-error");
    const body = await res.json().catch(() => ({ message: appError || res.statusText }));
    throw new Error(body.detail || body.message || appError || "Request failed");
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export const identityProviderService = {
  async list(): Promise<IdentityProvider[]> {
    const result = await api.get<IdentityProvider[]>("/api/identity-providers");
    return Array.isArray(result) ? result : [];
  },

  async getById(id: number): Promise<IdentityProvider> {
    return api.get<IdentityProvider>(`/api/identity-providers/${id}`);
  },

  async create(data: IdentityProviderFormData): Promise<IdentityProvider> {
    return multipartRequest<IdentityProvider>("POST", "/api/identity-providers", buildFormData(data));
  },

  async update(id: number, data: IdentityProviderFormData): Promise<IdentityProvider> {
    return multipartRequest<IdentityProvider>("PUT", `/api/identity-providers/${id}`, buildFormData(data));
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/api/identity-providers/${id}`);
  },

  async testConnection(provider: IdentityProvider): Promise<{ success: boolean; message: string }> {
    return api.post<{ success: boolean; message: string }>("/api/identity-providers/test", provider);
  },
};
