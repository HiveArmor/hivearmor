import { api } from "@/lib/api";

export interface EdrRule {
  id: number;
  ruleName: string;
  description?: string;
  eventType: string;
  platform: string;
  conditionJson: string;
  action: string;
  severity: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EdrEvent {
  id: number;
  agentId: string;
  hostname?: string;
  eventType: string;
  eventTime: string;
  processName?: string;
  processPid?: number;
  processPath?: string;
  processCmdline?: string;
  processUser?: string;
  processHash?: string;
  filePath?: string;
  fileHash?: string;
  networkSrcIp?: string;
  networkDstIp?: string;
  networkDstPort?: number;
  networkProto?: string;
  matchedRuleId?: number;
  severity: string;
  rawEvent?: string;
  createdAt: string;
}

export interface EdrQuarantine {
  id: number;
  agentId: string;
  hostname?: string;
  filePath: string;
  fileHash?: string;
  fileSize?: number;
  originalPath?: string;
  quarantinePath?: string;
  reason?: string;
  status: string;
  quarantinedAt: string;
  restoredAt?: string;
  actionedBy?: string;
  edrEventId?: number;
}

export interface EdrIsolation {
  id: number;
  agentId: string;
  hostname?: string;
  isolationType: string;
  status: string;
  reason?: string;
  allowedIps?: string;
  isolatedAt: string;
  liftedAt?: string;
  actionedBy: string;
  edrEventId?: number;
}

export interface EdrEventFilters {
  agentId?: string;
  eventType?: string;
  severity?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

const BASE = "/api/edr";

export const edrService = {
  // Rules
  listRules: () => api.get<EdrRule[]>(`${BASE}/rules`),
  getRule: (id: number) => api.get<EdrRule>(`${BASE}/rules/${id}`),
  createRule: (dto: Partial<EdrRule>) => api.post<EdrRule>(`${BASE}/rules`, dto),
  updateRule: (id: number, dto: Partial<EdrRule>) => api.put<EdrRule>(`${BASE}/rules/${id}`, dto),
  deleteRule: (id: number) => api.delete(`${BASE}/rules/${id}`),

  // Events
  queryEvents: async (filters: EdrEventFilters): Promise<{ data: EdrEvent[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters.agentId) params.set("agentId", filters.agentId);
    if (filters.eventType) params.set("eventType", filters.eventType);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(filters.page ?? 0));
    params.set("size", String(filters.size ?? 50));
    const result = await api.getWithHeaders<EdrEvent[]>(`${BASE}/events?${params}`);
    return {
      data: result.data,
      total: parseInt(result.headers.get("x-total-count") ?? "0", 10),
    };
  },

  // Quarantine
  listQuarantine: async (agentId?: string, status?: string): Promise<{ data: EdrQuarantine[]; total: number }> => {
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    if (status) params.set("status", status);
    const result = await api.getWithHeaders<EdrQuarantine[]>(`${BASE}/quarantine?${params}`);
    return {
      data: result.data,
      total: parseInt(result.headers.get("x-total-count") ?? "0", 10),
    };
  },
  quarantineFile: (dto: Partial<EdrQuarantine>) => api.post<EdrQuarantine>(`${BASE}/quarantine`, dto),
  restoreFile: (id: number) => api.post<EdrQuarantine>(`${BASE}/quarantine/${id}/restore`, {}),

  // Isolation
  listIsolations: async (status?: string): Promise<{ data: EdrIsolation[]; total: number }> => {
    const params = status ? `?status=${encodeURIComponent(status)}` : "";
    const result = await api.getWithHeaders<EdrIsolation[]>(`${BASE}/isolation${params}`);
    return {
      data: result.data,
      total: parseInt(result.headers.get("x-total-count") ?? "0", 10),
    };
  },
  isolateAgent: (dto: Partial<EdrIsolation>) => api.post<EdrIsolation>(`${BASE}/isolation`, dto),
  liftIsolation: (id: number) => api.post<EdrIsolation>(`${BASE}/isolation/${id}/lift`, {}),

  // Response actions
  killProcess: (agentId: string, pid: number, processName?: string) =>
    api.post<{ result: string }>(`${BASE}/actions/kill-process`, { agentId, pid, processName }),
};
