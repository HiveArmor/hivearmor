/**
 * Utm agent-policies API — push / group assign plane (schema v1 SoT).
 *
 * Confirmed backend paths (`AgentPolicyResource`, `AgentGroupResource`):
 *   GET/POST    /api/agent-policies
 *   GET/PUT/DELETE /api/agent-policies/{id}
 *   POST        /api/agent-policies/{id}/assign-group/{groupId}
 *   DELETE      /api/agent-policies/{id}/unassign-group/{groupId}
 *   POST        /api/agent-policies/{id}/push/{groupId}  → 202 Accepted
 *   POST        /api/agent-policies/{id}/push-agent/{agentId} → 202 (FE Next; BE may lag)
 *   GET         /api/agent-policies/{id}/push-log
 *   GET         /api/agent-policies/{id}/states
 *   GET         /api/agent-groups   (Admin; SOC Manager when BE allows — 403 fallback)
 *
 * Distinct from Ha `/api/ha-edr/policies` (legacy columns; no APPLY_POLICY push).
 */

import { apiClient } from '@/lib/apiClient';
import type {
  PolicyPushLogDTO,
  UtmAgentGroupDTO,
  UtmAgentPolicyDTO,
  UtmAgentPolicyStateDTO,
} from '@/types/agentPolicies';

export async function listUtmAgentPolicies(): Promise<UtmAgentPolicyDTO[]> {
  return apiClient.get<UtmAgentPolicyDTO[]>('/agent-policies');
}

export async function getUtmAgentPolicy(id: number): Promise<UtmAgentPolicyDTO> {
  return apiClient.get<UtmAgentPolicyDTO>(`/agent-policies/${id}`);
}

export async function createUtmAgentPolicy(
  dto: UtmAgentPolicyDTO,
): Promise<UtmAgentPolicyDTO> {
  return apiClient.post<UtmAgentPolicyDTO>('/agent-policies', dto);
}

export async function updateUtmAgentPolicy(
  id: number,
  dto: UtmAgentPolicyDTO,
): Promise<UtmAgentPolicyDTO> {
  return apiClient.put<UtmAgentPolicyDTO>(`/agent-policies/${id}`, dto);
}

export async function deleteUtmAgentPolicy(id: number): Promise<void> {
  return apiClient.delete<void>(`/agent-policies/${id}`);
}

export async function assignPolicyGroup(policyId: number, groupId: number): Promise<void> {
  return apiClient.post<void>(`/agent-policies/${policyId}/assign-group/${groupId}`);
}

export async function unassignPolicyGroup(policyId: number, groupId: number): Promise<void> {
  return apiClient.delete<void>(`/agent-policies/${policyId}/unassign-group/${groupId}`);
}

/** Dispatches APPLY_POLICY to group members. Backend returns 202 Accepted. */
export async function pushPolicyToGroup(policyId: number, groupId: number): Promise<void> {
  return apiClient.post<void>(`/agent-policies/${policyId}/push/${groupId}`);
}

/**
 * Dispatches APPLY_POLICY to a single agent.
 * STAGING CANDIDATE — requires BE `POST …/push-agent/{agentId}` (may 404 until landed).
 */
export async function pushPolicyToAgent(policyId: number, agentId: number): Promise<void> {
  return apiClient.post<void>(`/agent-policies/${policyId}/push-agent/${agentId}`);
}

export async function getPolicyPushLog(policyId: number): Promise<PolicyPushLogDTO[]> {
  return apiClient.get<PolicyPushLogDTO[]>(`/agent-policies/${policyId}/push-log`);
}

export async function getPolicyStates(policyId: number): Promise<UtmAgentPolicyStateDTO[]> {
  return apiClient.get<UtmAgentPolicyStateDTO[]>(`/agent-policies/${policyId}/states`);
}

/**
 * Lists agent groups. Prefer Admin | SOC Manager when BE allows list;
 * callers must treat 403 as graceful fallback to manual group id.
 */
export async function listAgentGroups(): Promise<UtmAgentGroupDTO[]> {
  return apiClient.get<UtmAgentGroupDTO[]>('/agent-groups');
}
