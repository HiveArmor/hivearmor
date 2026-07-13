import { api } from "@/lib/api";

export interface Agent {
  id: number;
  agentName: string;
  agentIp: string;
  agentOs: string;
  agentPlatform?: string;
  agentVersion?: string;
  agentStatus: number;
  lastSeen?: string;
  agentGroups?: string[];
  hostname?: string;
  agentType?: string;
  modules?: string[];
}

export interface AgentGroup {
  id: number;
  groupName: string;
  groupDescription?: string;
  agentCount?: number;
}

export interface Collector {
  id: number;
  hostname: string;
  ip?: string;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  module?: "AS_400" | "HIVEARMOR";
  version?: string;
  collectorKey?: string;
  lastSeen?: string;
  active?: boolean;
}

export interface Integration {
  id: number;
  moduleName: string;
  moduleDescription?: string;
  moduleCategory?: string;
  moduleIcon?: string;
  moduleIsActive?: boolean;
  serverName?: string;
  confCount?: number;
}

class AgentService {
  async listAgents(page = 0, size = 50): Promise<{ content: Agent[]; totalElements: number }> {
    try {
      const res = await api.get<Agent[]>(`/api/agent-manager/agents?page=${page}&size=${size}`);
      return { content: res || [], totalElements: res?.length || 0 };
    } catch {
      return { content: [], totalElements: 0 };
    }
  }

  async listGroups(): Promise<AgentGroup[]> {
    try { return await api.get<AgentGroup[]>("/api/agent-groups?page=0&size=100") || []; } catch { return []; }
  }

  async listCollectors(pageNumber = 0, pageSize = 50): Promise<{ content: Collector[]; totalElements: number }> {
    try {
      const res = await api.get<{ collectors: Collector[]; total: number }>(
        `/api/collectors?pageNumber=${pageNumber}&pageSize=${pageSize}`
      );
      return { content: res?.collectors || [], totalElements: res?.total || 0 };
    } catch {
      return { content: [], totalElements: 0 };
    }
  }

  async listIntegrations(): Promise<Integration[]> {
    try { return await api.get<Integration[]>("/api/ha-server-modules?page=0&size=100") || []; } catch { return []; }
  }

  async deleteAgent(id: number) { return api.delete(`/api/agent-manager/agents/${id}`); }
}

export const agentService = new AgentService();
