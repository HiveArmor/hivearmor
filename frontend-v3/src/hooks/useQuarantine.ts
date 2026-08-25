/**
 * TanStack Query v5 hooks for the HiveArmor File Quarantine Manager.
 *
 * - useQuarantinedFiles  — paginated list of quarantined file records
 * - useQuarantineAction  — single-file restore / delete mutation
 * - useQuarantineBulkAction — bulk restore / delete mutation
 *
 * Both mutation hooks invalidate the ['quarantine'] query key on success so
 * that the file list refreshes automatically after every state change.
 *
 * Auth: routed through apiClient which injects Authorization: Bearer <hivearmor_auth_token>.
 * Do NOT read localStorage directly in these hooks.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToastStore } from '@/components/toast-stack/toastStore';
import {
  bulkUpdateQuarantine,
  fetchIsolatedHosts,
  fetchQuarantinedFiles,
  updateQuarantineStatus,
} from '@/services/edrService';
import type {
  IsolationListQuery,
  IsolationPage,
  QuarantineListQuery,
  QuarantinePage,
  QuarantinedFileDTO,
} from '@/types/edr';

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of quarantined files.
 *
 * queryKey shape: ['quarantine', query]
 *
 * The hook is disabled when `query` is null to allow conditional usage from
 * parent components that may not yet have filter values selected.
 *
 * @param query - List query parameters (agentId, status, page, size), or null to disable.
 * @returns The raw TanStack Query result with `data` typed as `QuarantinePage`.
 */
export function useQuarantinedFiles(query: QuarantineListQuery | null) {
  return useQuery<QuarantinePage>({
    queryKey: ['quarantine', query],
    queryFn: ({ signal }) => fetchQuarantinedFiles(query as QuarantineListQuery, signal),
    enabled: query !== null,
    staleTime: 20_000,
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
}

/**
 * Fetches a paginated host-isolation inventory from GET /api/ha-edr/isolation.
 * queryKey shape: ['isolation', query]
 */
export function useIsolatedHosts(query: IsolationListQuery | null) {
  return useQuery<IsolationPage>({
    queryKey: ['isolation', query],
    queryFn: ({ signal }) => fetchIsolatedHosts(query as IsolationListQuery, signal),
    enabled: query !== null,
    staleTime: 20_000,
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Single-file mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that applies a restore or delete action to a single quarantined
 * file by ID.
 *
 * On success, invalidates all queries under the ['quarantine'] key so the
 * file list refreshes automatically.
 */
export function useQuarantineAction() {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();

  return useMutation<
    QuarantinedFileDTO,
    Error,
    { id: number; action: 'restore' | 'delete' }
  >({
    mutationFn: ({ id, action }) => updateQuarantineStatus(id, action),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      addToast({
        variant: 'success',
        title: variables.action === 'restore' ? 'Restore requested' : 'Deletion requested',
        description: 'The record will refresh from the authoritative endpoint state.',
      });
    },
    onError: (error, variables) => addToast({
      variant: 'danger',
      title: variables.action === 'restore' ? 'Restore request failed' : 'Deletion request failed',
      description: error.message,
    }),
  });
}

// ---------------------------------------------------------------------------
// Bulk mutation hook
// ---------------------------------------------------------------------------

/**
 * Mutation hook that applies a restore or delete action to multiple quarantined
 * files in a single request.
 *
 * On success, invalidates all queries under the ['quarantine'] key so the
 * file list refreshes automatically.
 */
export function useQuarantineBulkAction() {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();

  return useMutation<
    QuarantinedFileDTO[],
    Error,
    { ids: number[]; action: 'restore' | 'delete' }
  >({
    mutationFn: ({ ids, action }) => bulkUpdateQuarantine(ids, action),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      addToast({
        variant: 'success',
        title: variables.action === 'restore' ? 'Bulk restore requested' : 'Bulk deletion requested',
        description: `${result.length} eligible record${result.length === 1 ? '' : 's'} accepted by the current endpoint.`,
      });
    },
    onError: (error, variables) => addToast({
      variant: 'danger',
      title: variables.action === 'restore' ? 'Bulk restore failed' : 'Bulk deletion failed',
      description: error.message,
    }),
  });
}
