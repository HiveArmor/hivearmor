/**
 * TanStack Query hooks for the HiveArmor Sigma detection pipeline.
 * Provides data-fetching and mutation hooks consumed by RuleImportPage.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSigmaRules, triggerSigmaSync } from '@/services/sigmaService';
import type { SigmaRuleFilters } from '@/services/sigmaService';
import type { SigmaRuleDTO, SigmaSyncResultDTO } from '@/types/sigma';

/**
 * Fetches a paged list of Sigma rules, keyed by the supplied filter object.
 * Page size is fixed at 25 rows to match the AG Grid page size.
 */
export function useSigmaRules(filters: SigmaRuleFilters): ReturnType<
  typeof useQuery<SigmaRuleDTO[]>
> {
  return useQuery<SigmaRuleDTO[]>({
    queryKey: ['sigma-rules', filters],
    queryFn: () => getSigmaRules({ ...filters, size: 25 }),
  });
}

/**
 * Mutation hook that triggers a manual Sigma rule sync from SigmaHQ.
 * On success the sigma-rules query cache is invalidated so the grid refetches.
 */
export function useSigmaSync(): ReturnType<
  typeof useMutation<SigmaSyncResultDTO, Error, void>
> {
  const qc = useQueryClient();
  return useMutation<SigmaSyncResultDTO, Error, void>({
    mutationFn: triggerSigmaSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sigma-rules'] }),
  });
}
