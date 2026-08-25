/**
 * TanStack Query v5 hooks for the HiveArmor Agent Policy Management UI (T05).
 *
 * - useAgentPolicies      — fetches all agent monitoring policies
 * - useCreateAgentPolicy  — creates a new policy
 * - useUpdateAgentPolicy  — replaces an existing policy by ID
 * - useDeleteAgentPolicy  — removes a policy by ID
 * - useAssignAgents       — assigns a list of agent IDs to a policy
 *
 * All mutation hooks invalidate the ['agent-policies'] query key on success so
 * that the policy list refreshes automatically after every write operation.
 *
 * Auth: routed through apiClient which injects Authorization: Bearer <hivearmor_auth_token>.
 * Do NOT read localStorage directly in these hooks.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignAgents,
  createAgentPolicy,
  deleteAgentPolicy,
  getAgentPolicyEnforcementEvidence,
  listAgentPolicies,
  updateAgentPolicy,
} from '@/services/agentPolicyService';
import type { AgentPolicyDTO, AgentPolicyEnforcementEvidenceDTO } from '@/types/edr';

// ---------------------------------------------------------------------------
// Shared query key
// ---------------------------------------------------------------------------

const AGENT_POLICIES_KEY = ['agent-policies'] as const;

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

/**
 * Fetches the full list of agent monitoring policies.
 *
 * queryKey: ['agent-policies']
 *
 * @returns The raw TanStack Query result with `data` typed as `AgentPolicyDTO[]`.
 */
export function useAgentPolicies() {
  return useQuery<AgentPolicyDTO[]>({
    queryKey: AGENT_POLICIES_KEY,
    queryFn: listAgentPolicies,
  });
}

// ---------------------------------------------------------------------------
// Create mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that creates a new agent monitoring policy.
 *
 * On success, invalidates all queries under the ['agent-policies'] key so the
 * policy list refreshes automatically.
 *
 * @example
 * const { mutate } = useCreateAgentPolicy();
 * mutate(dto);
 */
export function useCreateAgentPolicy() {
  const queryClient = useQueryClient();

  return useMutation<AgentPolicyDTO, Error, AgentPolicyDTO>({
    mutationFn: (dto) => createAgentPolicy(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AGENT_POLICIES_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Update mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that replaces an existing agent monitoring policy by ID.
 *
 * Variable shape: `{ id: number, dto: AgentPolicyDTO }`
 *
 * On success, invalidates all queries under the ['agent-policies'] key so the
 * policy list refreshes automatically.
 *
 * @example
 * const { mutate } = useUpdateAgentPolicy();
 * mutate({ id: 42, dto });
 */
export function useUpdateAgentPolicy() {
  const queryClient = useQueryClient();

  return useMutation<AgentPolicyDTO, Error, { id: number; dto: AgentPolicyDTO }>({
    mutationFn: ({ id, dto }) => updateAgentPolicy(id, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AGENT_POLICIES_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that deletes an agent monitoring policy by ID.
 *
 * Variable type: `number` (the policy ID)
 *
 * On success, invalidates all queries under the ['agent-policies'] key so the
 * policy list refreshes automatically.
 *
 * @example
 * const { mutate } = useDeleteAgentPolicy();
 * mutate(42);
 */
export function useDeleteAgentPolicy() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id) => deleteAgentPolicy(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AGENT_POLICIES_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Assign agents mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that assigns a list of agent IDs to an existing policy.
 *
 * Variable shape: `{ id: number, agentIds: string[] }`
 *
 * On success, invalidates all queries under the ['agent-policies'] key so the
 * policy list (including `assignedAgentIds`) refreshes automatically.
 *
 * @example
 * const { mutate } = useAssignAgents();
 * mutate({ id: 42, agentIds: ['uuid-1', 'uuid-2'] });
 */
export function useAssignAgents() {
  const queryClient = useQueryClient();

  return useMutation<AgentPolicyDTO, Error, { id: number; agentIds: string[] }>({
    mutationFn: ({ id, agentIds }) => assignAgents(id, agentIds),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: AGENT_POLICIES_KEY });
      void queryClient.invalidateQueries({
        queryKey: [...AGENT_POLICIES_KEY, 'enforcement', variables.id],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Enforcement evidence query (POL-001 STAGING CANDIDATE)
// ---------------------------------------------------------------------------

/**
 * Fetches assignment + agent-reported state for a policy when `policyId` is set.
 * Does not invent host enforcement — surfaces unavailable/partial from the backend.
 */
export function useAgentPolicyEnforcementEvidence(policyId: number | null) {
  return useQuery<AgentPolicyEnforcementEvidenceDTO>({
    queryKey: [...AGENT_POLICIES_KEY, 'enforcement', policyId],
    queryFn: () => {
      if (policyId == null) {
        throw new Error('policyId required');
      }
      return getAgentPolicyEnforcementEvidence(policyId);
    },
    enabled: policyId != null,
  });
}
