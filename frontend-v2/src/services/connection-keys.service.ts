import { api } from "@/lib/api";

export interface ApiKeyRecord {
  id: number;
  name: string;
  allowedIp: string[] | null;
  createdAt: string;
  expiresAt: string | null;
  generatedAt: string | null;
}

export interface ApiKeyUpsert {
  name: string;
  allowedIp?: string[];
  expiresAt?: string;
}

class ConnectionKeysService {
  async list(page = 0, size = 50): Promise<ApiKeyRecord[]> {
    return api.get<ApiKeyRecord[]>(`/api/api-keys?page=${page}&size=${size}&sort=createdAt,desc`);
  }

  async create(dto: ApiKeyUpsert): Promise<ApiKeyRecord> {
    return api.post<ApiKeyRecord>("/api/api-keys", dto);
  }

  async generate(id: number): Promise<string> {
    return api.post<string>(`/api/api-keys/${id}/generate`, {});
  }

  async update(id: number, dto: ApiKeyUpsert): Promise<ApiKeyRecord> {
    return api.put<ApiKeyRecord>(`/api/api-keys/${id}`, dto);
  }

  async delete(id: number): Promise<void> {
    return api.delete(`/api/api-keys/${id}`);
  }
}

export const connectionKeysService = new ConnectionKeysService();
