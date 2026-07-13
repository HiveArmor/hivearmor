import { api } from "@/lib/api";

export interface AgentGroup {
  id: number;
  groupName: string;
  description?: string;
  platform?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  memberCount: number;
  memberAgentIds: number[];
}

export interface AgentPolicy {
  id: number;
  policyName: string;
  description?: string;
  platform?: string;
  policyConfig: string;
  versionNum: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  assignedGroupIds: number[];
}

export interface PolicyPushLog {
  id: number;
  policyId: number;
  policyName: string;
  agentId: string;
  pushedAt: string;
  pushStatus: "PENDING" | "DELIVERED" | "FAILED" | "ACKNOWLEDGED";
  errorMsg?: string;
  ackAt?: string;
}

export interface AgentPolicyState {
  id: number;
  agentId: string;
  policyId: number;
  appliedVersion?: number;
  desiredVersion?: number;
  state: "APPLIED" | "PENDING" | "DRIFT" | "FAILED";
  lastCheckedAt?: string;
  lastAppliedAt?: string;
  driftDetails?: string;
}

class AgentGroupsService {
  // Groups
  async listGroups(): Promise<AgentGroup[]> {
    return api.get<AgentGroup[]>("/api/agent-groups");
  }

  async getGroup(id: number): Promise<AgentGroup> {
    return api.get<AgentGroup>(`/api/agent-groups/${id}`);
  }

  async createGroup(dto: Partial<AgentGroup>): Promise<AgentGroup> {
    return api.post<AgentGroup>("/api/agent-groups", dto);
  }

  async updateGroup(id: number, dto: Partial<AgentGroup>): Promise<AgentGroup> {
    return api.put<AgentGroup>(`/api/agent-groups/${id}`, dto);
  }

  async deleteGroup(id: number): Promise<void> {
    return api.delete(`/api/agent-groups/${id}`);
  }

  async setGroupMembers(id: number, agentIds: number[]): Promise<void> {
    return api.put(`/api/agent-groups/${id}/members`, agentIds);
  }

  // Policies
  async listPolicies(): Promise<AgentPolicy[]> {
    return api.get<AgentPolicy[]>("/api/agent-policies");
  }

  async getPolicy(id: number): Promise<AgentPolicy> {
    return api.get<AgentPolicy>(`/api/agent-policies/${id}`);
  }

  async createPolicy(dto: Partial<AgentPolicy>): Promise<AgentPolicy> {
    return api.post<AgentPolicy>("/api/agent-policies", dto);
  }

  async updatePolicy(id: number, dto: Partial<AgentPolicy>): Promise<AgentPolicy> {
    return api.put<AgentPolicy>(`/api/agent-policies/${id}`, dto);
  }

  async deletePolicy(id: number): Promise<void> {
    return api.delete(`/api/agent-policies/${id}`);
  }

  async assignGroup(policyId: number, groupId: number): Promise<void> {
    return api.post(`/api/agent-policies/${policyId}/assign-group/${groupId}`, {});
  }

  async unassignGroup(policyId: number, groupId: number): Promise<void> {
    return api.delete(`/api/agent-policies/${policyId}/unassign-group/${groupId}`);
  }

  async pushPolicyToGroup(policyId: number, groupId: number): Promise<void> {
    return api.post(`/api/agent-policies/${policyId}/push/${groupId}`, {});
  }

  async getPushLog(policyId: number): Promise<PolicyPushLog[]> {
    return api.get<PolicyPushLog[]>(`/api/agent-policies/${policyId}/push-log`);
  }

  async getPolicyStates(policyId: number): Promise<AgentPolicyState[]> {
    return api.get<AgentPolicyState[]>(`/api/agent-policies/${policyId}/states`);
  }
}

export const agentGroupsService = new AgentGroupsService();
