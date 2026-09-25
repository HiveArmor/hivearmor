/**
 * TanStack Query hooks for PT-3 host→template associations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  applyAssociation,
  createAssociation,
  deleteAssociation,
  listAssociations,
  resolveHost,
  updateAssociation,
} from '@/services/hostTemplateAssociationsApi.service';
import type {
  ApplyResultDTO,
  EffectivePolicyDTO,
  HostTemplateAssociationDTO,
} from '@/types/hostTemplateAssociations';

export const HOST_ASSOCIATIONS_KEY = ['host-template-associations'] as const;

export function useHostAssociations(enabled = true) {
  return useQuery<HostTemplateAssociationDTO[]>({
    queryKey: HOST_ASSOCIATIONS_KEY,
    queryFn: listAssociations,
    enabled,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: HOST_ASSOCIATIONS_KEY });
}

export function useCreateHostAssociation() {
  const queryClient = useQueryClient();
  return useMutation<HostTemplateAssociationDTO, Error, HostTemplateAssociationDTO>({
    mutationFn: createAssociation,
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateHostAssociation() {
  const queryClient = useQueryClient();
  return useMutation<HostTemplateAssociationDTO, Error, { id: number; dto: HostTemplateAssociationDTO }>({
    mutationFn: ({ id, dto }) => updateAssociation(id, dto),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteHostAssociation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteAssociation,
    onSuccess: () => invalidate(queryClient),
  });
}

export function useApplyHostAssociation() {
  const queryClient = useQueryClient();
  return useMutation<ApplyResultDTO, Error, number>({
    mutationFn: applyAssociation,
    onSuccess: () => invalidate(queryClient),
  });
}

/** On-demand host resolution (preview). Not auto-fetched; call via the returned mutate. */
export function useResolveHost() {
  return useMutation<EffectivePolicyDTO, Error, string>({
    mutationFn: resolveHost,
  });
}
