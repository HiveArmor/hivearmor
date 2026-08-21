/**
 * TanStack Query hooks for HiveArmor Saved Hunts.
 * Wraps CRUD service calls with query-cache invalidation on mutations.
 *
 * Auth: all requests route through apiClient which injects
 * Authorization: Bearer <hivearmor_auth_token>.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createSavedHunt,
  deleteSavedHunt,
  getSavedHunts,
  updateSavedHunt,
} from '@/services/searchService';
import type { SavedHuntDTO } from '@/types/search';

const QUERY_KEY = ['saved-hunts'] as const;

/**
 * Fetches all saved hunts visible to the current user
 * (own hunts + shared hunts).
 */
export function useSavedHunts(): ReturnType<typeof useQuery<SavedHuntDTO[]>> {
  return useQuery<SavedHuntDTO[]>({
    queryKey: QUERY_KEY,
    queryFn: getSavedHunts,
  });
}

/**
 * Mutation hook that creates a new saved hunt.
 * Invalidates the ['saved-hunts'] cache on success.
 */
export function useCreateSavedHunt(): ReturnType<
  typeof useMutation<SavedHuntDTO, Error, Omit<SavedHuntDTO, 'id' | 'createdBy' | 'createdAt'>>
> {
  const qc = useQueryClient();
  return useMutation<
    SavedHuntDTO,
    Error,
    Omit<SavedHuntDTO, 'id' | 'createdBy' | 'createdAt'>
  >({
    mutationFn: createSavedHunt,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Mutation hook that updates a saved hunt by id.
 * Invalidates the ['saved-hunts'] cache on success.
 */
export function useUpdateSavedHunt(): ReturnType<
  typeof useMutation<SavedHuntDTO, Error, { id: number; data: Partial<SavedHuntDTO> }>
> {
  const qc = useQueryClient();
  return useMutation<SavedHuntDTO, Error, { id: number; data: Partial<SavedHuntDTO> }>({
    mutationFn: ({ id, data }) => updateSavedHunt(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Mutation hook that deletes a saved hunt by id.
 * Invalidates the ['saved-hunts'] cache on success.
 */
export function useDeleteSavedHunt(): ReturnType<
  typeof useMutation<void, Error, number>
> {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteSavedHunt,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
