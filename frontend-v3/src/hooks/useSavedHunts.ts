/**
 * TanStack Query hooks for HiveArmor Saved Hunts.
 * Wraps CRUD against `/api/ha-hunts/saved` (HNT-005) with query-cache invalidation.
 *
 * Auth: all requests route through apiClient which injects
 * Authorization: Bearer <hivearmor_auth_token>.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createSavedHunt,
  deleteSavedHunt,
  fetchSavedHunts,
  searchHuntFixtureMode,
  updateSavedHunt,
} from '@/pages/search-hunt/searchHunt.service';
import type { SavedHunt } from '@/pages/search-hunt/searchHunt.types';

const QUERY_KEY = ['saved-hunts'] as const;

/** Library row shape used by SearchHuntPage (maps HNT-005 SavedHunt fields). */
export interface HuntLibraryItem {
  id: string;
  huntName: string;
  queryDsl: string | null;
  nlQuery: string | null;
  isShared: boolean;
  createdBy: string;
}

function toLibraryItem(hunt: SavedHunt): HuntLibraryItem {
  return {
    id: hunt.id,
    huntName: hunt.name,
    queryDsl: hunt.query,
    nlQuery: null,
    isShared: hunt.shared,
    createdBy: hunt.createdBy,
  };
}

/**
 * Fetches all saved hunts visible to the current user
 * (own hunts + shared hunts) from `/api/ha-hunts/saved`.
 */
export function useSavedHunts(): ReturnType<typeof useQuery<HuntLibraryItem[]>> {
  return useQuery<HuntLibraryItem[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      if (searchHuntFixtureMode) {
        const { foundationSavedHunts } = await import('@/pages/search-hunt/searchHunt.fixtures');
        return foundationSavedHunts.map((hunt) => ({
          id: String(hunt.id),
          huntName: hunt.huntName,
          queryDsl: hunt.queryDsl,
          nlQuery: hunt.nlQuery,
          isShared: hunt.isShared,
          createdBy: hunt.createdBy,
        }));
      }
      const { items } = await fetchSavedHunts();
      return items.map(toLibraryItem);
    },
  });
}

export interface CreateHuntLibraryInput {
  huntName: string;
  queryDsl: string | null;
  nlQuery?: string | null;
  filterJson?: string | null;
  isShared: boolean;
  lastUsedAt?: string | null;
}

/**
 * Mutation hook that creates a new saved hunt via POST /ha-hunts/saved.
 * Invalidates the ['saved-hunts'] cache on success.
 */
export function useCreateSavedHunt(): ReturnType<
  typeof useMutation<HuntLibraryItem, Error, CreateHuntLibraryInput>
> {
  const qc = useQueryClient();
  return useMutation<HuntLibraryItem, Error, CreateHuntLibraryInput>({
    mutationFn: async (data) => {
      if (searchHuntFixtureMode) {
        return {
          id: `fixture-${Date.now()}`,
          huntName: data.huntName,
          queryDsl: data.queryDsl,
          nlQuery: data.nlQuery ?? null,
          isShared: data.isShared,
          createdBy: 'fixture',
        };
      }
      const created = await createSavedHunt({
        name: data.huntName,
        query: data.queryDsl?.trim() || '*:*',
        tags: [],
        shared: data.isShared,
      });
      return toLibraryItem(created);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Mutation hook that updates a saved hunt by id.
 * Invalidates the ['saved-hunts'] cache on success.
 */
export function useUpdateSavedHunt(): ReturnType<
  typeof useMutation<HuntLibraryItem, Error, { id: string; data: Partial<CreateHuntLibraryInput> }>
> {
  const qc = useQueryClient();
  return useMutation<HuntLibraryItem, Error, { id: string; data: Partial<CreateHuntLibraryInput> }>({
    mutationFn: async ({ id, data }) => {
      const patch: Partial<SavedHunt> = {};
      if (data.huntName !== undefined) patch.name = data.huntName;
      if (data.queryDsl !== undefined) patch.query = data.queryDsl ?? '';
      if (data.isShared !== undefined) patch.shared = data.isShared;
      const updated = await updateSavedHunt(id, patch);
      return toLibraryItem(updated);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/**
 * Mutation hook that deletes a saved hunt by id.
 * Invalidates the ['saved-hunts'] cache on success.
 */
export function useDeleteSavedHunt(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteSavedHunt(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
