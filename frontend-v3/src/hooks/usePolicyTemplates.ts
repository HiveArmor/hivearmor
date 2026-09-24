/**
 * TanStack Query hooks for the PT-2 policy-template library
 * (`/api/agent-policies/templates` + reused PUT/clone on `/agent-policies`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  clonePolicyTemplate,
  createPolicyTemplate,
  listPolicyTemplates,
  searchPolicyTemplates,
  updatePolicyTemplate,
  type TemplateSearchParams,
} from '@/services/policyTemplatesApi.service';
import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';
import type { PolicyTemplateEnvelope } from '@/types/policyTemplates';

export const POLICY_TEMPLATES_KEY = ['policy-templates'] as const;

function hasFilters(params: TemplateSearchParams): boolean {
  return Boolean(
    (params.name && params.name.trim()) ||
      params.scope ||
      (params.platform && params.platform.trim() && params.platform !== 'any'),
  );
}

export function usePolicyTemplates(params: TemplateSearchParams = {}, enabled = true) {
  const filtered = hasFilters(params);
  return useQuery<UtmAgentPolicyDTO[]>({
    queryKey: [...POLICY_TEMPLATES_KEY, 'list', params],
    queryFn: () => (filtered ? searchPolicyTemplates(params) : listPolicyTemplates()),
    enabled,
  });
}

function invalidateTemplates(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: POLICY_TEMPLATES_KEY });
}

export function useCreatePolicyTemplate() {
  const queryClient = useQueryClient();
  return useMutation<UtmAgentPolicyDTO, Error, PolicyTemplateEnvelope>({
    mutationFn: createPolicyTemplate,
    onSuccess: () => invalidateTemplates(queryClient),
  });
}

export function useUpdatePolicyTemplate() {
  const queryClient = useQueryClient();
  return useMutation<UtmAgentPolicyDTO, Error, { id: number; dto: UtmAgentPolicyDTO }>({
    mutationFn: ({ id, dto }) => updatePolicyTemplate(id, dto),
    onSuccess: () => invalidateTemplates(queryClient),
  });
}

export function useClonePolicyTemplate() {
  const queryClient = useQueryClient();
  return useMutation<UtmAgentPolicyDTO, Error, { id: number; newName: string }>({
    mutationFn: ({ id, newName }) => clonePolicyTemplate(id, newName),
    onSuccess: () => invalidateTemplates(queryClient),
  });
}
