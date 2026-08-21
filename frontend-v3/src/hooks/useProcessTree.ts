/**
 * TanStack Query v5 hook for the HiveArmor Process Tree.
 *
 * Fetches a flat list of process nodes from GET /api/ha-edr/process-tree,
 * then assembles them into a nested forest via `buildProcessTree`.
 *
 * The hook is disabled when `params` is null to allow conditional usage from
 * parent components that may not yet have a selected agent/timestamp.
 *
 * Auth: routed through apiClient which injects Authorization: Bearer <hivearmor_auth_token>.
 * Do NOT read localStorage directly in this hook.
 */

import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { fetchProcessTree, buildProcessTree } from '@/services/edrService';
import type { ProcessNodeDTO, ProcessTreeQueryParams } from '@/types/edr';

export interface UseProcessTreeResult {
  roots: ProcessNodeDTO[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Fetches and assembles the process tree for the given agent and time window.
 *
 * queryKey shape: ['edr', 'process-tree', params]
 *
 * @param params - Query parameters for the process tree request, or null to disable.
 * @returns The assembled tree roots, along with loading/error state.
 */
export function useProcessTree(params: ProcessTreeQueryParams | null): UseProcessTreeResult {
  const q = useQuery({
    queryKey: ['edr', 'process-tree', params],
    queryFn: () => fetchProcessTree(params as ProcessTreeQueryParams),
    enabled: params !== null,
  });

  const roots = useMemo(
    () => (q.data ? buildProcessTree(q.data) : []),
    [q.data],
  );

  return {
    roots,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}
