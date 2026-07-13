import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UtmServerModule {
  id: number;
  serverId?: number;
  moduleName: string;
  prettyName?: string;
  needsRestart?: boolean;
}

export interface UtmIntegration {
  id: number;
  moduleId?: number;
  integrationName?: string;
  integrationDescription?: string;
  url?: string;
  integrationIconPath?: string;
  module?: UtmServerModule;
}

// ── Service ────────────────────────────────────────────────────────────────

class IntegrationService {
  async listIntegrations(page = 0, size = 100): Promise<UtmIntegration[]> {
    const res = await api.get<UtmIntegration[]>(
      `/api/ha-integrations?page=${page}&size=${size}`
    );
    return res ?? [];
  }

  async getIntegration(id: number): Promise<UtmIntegration> {
    return api.get<UtmIntegration>(`/api/ha-integrations/${id}`);
  }

  async createIntegration(integration: Omit<UtmIntegration, "id">): Promise<UtmIntegration> {
    return api.post<UtmIntegration>("/api/ha-integrations", integration);
  }

  async updateIntegration(integration: UtmIntegration): Promise<UtmIntegration> {
    return api.put<UtmIntegration>("/api/ha-integrations", integration);
  }

  async listServerModules(page = 0, size = 100): Promise<UtmServerModule[]> {
    const res = await api.get<UtmServerModule[]>(
      `/api/ha-server-modules?page=${page}&size=${size}`
    );
    return res ?? [];
  }

  async getModulesWithIntegrations(serverId?: number): Promise<UtmServerModule[]> {
    const params = serverId != null ? `?serverId=${serverId}` : "";
    const res = await api.get<UtmServerModule[]>(
      `/api/ha-server-modules/modules-with-integrations${params}`
    );
    return res ?? [];
  }

  async updateServerModule(module: UtmServerModule): Promise<UtmServerModule> {
    return api.put<UtmServerModule>("/api/ha-server-modules", module);
  }
}

export const integrationService = new IntegrationService();
