/**
 * Agent Policy Service
 * API calls for HiveArmor Agent Policy Management (T05).
 * All requests route via the Vite /api/* proxy — no absolute backend URLs.
 *
 * Endpoints:
 *   GET    /api/ha-edr/policies
 *   GET    /api/ha-edr/policies/{id}/enforcement  (POL-001 STAGING CANDIDATE)
 *   POST   /api/ha-edr/policies
 *   PUT    /api/ha-edr/policies/{id}
 *   DELETE /api/ha-edr/policies/{id}
 *   POST   /api/ha-edr/policies/{id}/assign
 */

import type {
  AgentPolicyDTO,
  AgentPolicyEnforcementEvidenceDTO,
} from '../types/edr';

import { apiClient } from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Fetches all agent monitoring policies.
 *
 * Issues an authenticated GET to /api/ha-edr/policies and returns the full
 * list. Never uses an absolute backend URL — routes through the shared
 * apiClient and the Vite /api/* proxy.
 */
export async function listAgentPolicies(): Promise<AgentPolicyDTO[]> {
  return apiClient.get<AgentPolicyDTO[]>('/ha-edr/policies');
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a new agent monitoring policy.
 *
 * Issues an authenticated POST to /api/ha-edr/policies with `dto` as the
 * JSON body and returns the created `AgentPolicyDTO` (including the
 * server-assigned `id` and `createdAt`).
 * Never uses an absolute backend URL.
 */
export async function createAgentPolicy(dto: AgentPolicyDTO): Promise<AgentPolicyDTO> {
  return apiClient.post<AgentPolicyDTO>('/ha-edr/policies', dto);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Replaces an existing agent monitoring policy by ID.
 *
 * Issues an authenticated PUT to /api/ha-edr/policies/{id} with `dto` as
 * the JSON body and returns the updated `AgentPolicyDTO`.
 * Never uses an absolute backend URL.
 */
export async function updateAgentPolicy(
  id: number,
  dto: AgentPolicyDTO,
): Promise<AgentPolicyDTO> {
  return apiClient.put<AgentPolicyDTO>(`/ha-edr/policies/${id}`, dto);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Deletes an agent monitoring policy by ID.
 *
 * Issues an authenticated DELETE to /api/ha-edr/policies/{id}.
 * The backend returns HTTP 204 No Content on success; the apiClient returns
 * `undefined` for 204 responses, so the return type is `void`.
 * Never uses an absolute backend URL.
 */
export async function deleteAgentPolicy(id: number): Promise<void> {
  return apiClient.delete<void>(`/ha-edr/policies/${id}`);
}

// ---------------------------------------------------------------------------
// Assign agents
// ---------------------------------------------------------------------------

/**
 * Assigns a list of agent IDs to an existing policy.
 *
 * Issues an authenticated POST to /api/ha-edr/policies/{id}/assign with
 * `{ agentIds }` as the JSON body and returns the updated `AgentPolicyDTO`
 * (whose `assignedAgentIds` reflects the new assignment).
 * Never uses an absolute backend URL.
 */
export async function assignAgents(
  id: number,
  agentIds: string[],
): Promise<AgentPolicyDTO> {
  return apiClient.post<AgentPolicyDTO>(`/ha-edr/policies/${id}/assign`, { agentIds });
}

// ---------------------------------------------------------------------------
// Enforcement evidence (POL-001)
// ---------------------------------------------------------------------------

/**
 * Fetches assignment plus agent-reported state rows for a policy.
 *
 * Issues GET /api/ha-edr/policies/{id}/enforcement. Availability is only
 * `unavailable` or `partial` — never treat as production host enforcement.
 */
export async function getAgentPolicyEnforcementEvidence(
  id: number,
): Promise<AgentPolicyEnforcementEvidenceDTO> {
  return apiClient.get<AgentPolicyEnforcementEvidenceDTO>(
    `/ha-edr/policies/${id}/enforcement`,
  );
}
