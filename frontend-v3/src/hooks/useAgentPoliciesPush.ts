/**
 * TanStack Query hooks for Utm `/api/agent-policies` (push plane).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignPolicyGroup,
  createUtmAgentPolicy,
  deleteUtmAgentPolicy,
  getPolicyPushLog,
  getPolicyStates,
  listAgentGroups,
  listUtmAgentPolicies,
  pushPolicyToGroup,
  unassignPolicyGroup,
  updateUtmAgentPolicy,
} from '@/services/agentPoliciesApi.service';
import type {
  PolicyPushLogDTO,
  UtmAgentGroupDTO,
  UtmAgentPolicyDTO,
  UtmAgentPolicyStateDTO,
} from '@/types/agentPolicies';

export const UTM_AGENT_POLICIES_KEY = ['utm-agent-policies'] as const;
export const UTM_AGENT_GROUPS_KEY = ['utm-agent-groups'] as const;

export function useUtmAgentPolicies(enabled = true) {
  return useQuery<UtmAgentPolicyDTO[]>({
    queryKey: UTM_AGENT_POLICIES_KEY,
    queryFn: listUtmAgentPolicies,
    enabled,
  });
}

export function useAgentGroups(enabled = true) {
  return useQuery<UtmAgentGroupDTO[]>({
    queryKey: UTM_AGENT_GROUPS_KEY,
    queryFn: listAgentGroups,
    enabled,
    retry: false,
  });
}

export function usePolicyPushLog(policyId: number | null) {
  return useQuery<PolicyPushLogDTO[]>({
    queryKey: [...UTM_AGENT_POLICIES_KEY, 'push-log', policyId],
    queryFn: () => {
      if (policyId == null) throw new Error('policyId required');
      return getPolicyPushLog(policyId);
    },
    enabled: policyId != null,
  });
}

export function usePolicyStates(policyId: number | null) {
  return useQuery<UtmAgentPolicyStateDTO[]>({
    queryKey: [...UTM_AGENT_POLICIES_KEY, 'states', policyId],
    queryFn: () => {
      if (policyId == null) throw new Error('policyId required');
      return getPolicyStates(policyId);
    },
    enabled: policyId != null,
  });
}

function invalidatePolicies(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: UTM_AGENT_POLICIES_KEY });
}

export function useCreateUtmAgentPolicy() {
  const queryClient = useQueryClient();
  return useMutation<UtmAgentPolicyDTO, Error, UtmAgentPolicyDTO>({
    mutationFn: createUtmAgentPolicy,
    onSuccess: () => invalidatePolicies(queryClient),
  });
}

export function useUpdateUtmAgentPolicy() {
  const queryClient = useQueryClient();
  return useMutation<UtmAgentPolicyDTO, Error, { id: number; dto: UtmAgentPolicyDTO }>({
    mutationFn: ({ id, dto }) => updateUtmAgentPolicy(id, dto),
    onSuccess: () => invalidatePolicies(queryClient),
  });
}

export function useDeleteUtmAgentPolicy() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteUtmAgentPolicy,
    onSuccess: () => invalidatePolicies(queryClient),
  });
}

export function useAssignPolicyGroup() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { policyId: number; groupId: number }>({
    mutationFn: ({ policyId, groupId }) => assignPolicyGroup(policyId, groupId),
    onSuccess: () => invalidatePolicies(queryClient),
  });
}

export function useUnassignPolicyGroup() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { policyId: number; groupId: number }>({
    mutationFn: ({ policyId, groupId }) => unassignPolicyGroup(policyId, groupId),
    onSuccess: () => invalidatePolicies(queryClient),
  });
}

export function usePushPolicyToGroup() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { policyId: number; groupId: number }>({
    mutationFn: ({ policyId, groupId }) => pushPolicyToGroup(policyId, groupId),
    onSuccess: (_data, variables) => {
      invalidatePolicies(queryClient);
      void queryClient.invalidateQueries({
        queryKey: [...UTM_AGENT_POLICIES_KEY, 'push-log', variables.policyId],
      });
      void queryClient.invalidateQueries({
        queryKey: [...UTM_AGENT_POLICIES_KEY, 'states', variables.policyId],
      });
    },
  });
}
