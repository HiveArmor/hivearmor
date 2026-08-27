/**
 * TanStack Query hooks for confirmed `/api/ha-saved-queries*` CRUD.
 * Lives next to SearchHuntPage so Prompt 10 stays scoped to search-hunt/.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { searchHuntFixtureMode } from './searchHunt.service';

import {
  createSavedQuery,
  deleteSavedQuery,
  getSavedQueries,
  type HaSavedQuery,
} from '@/services/search.service';

const QUERY_KEY = ['ha-saved-queries'] as const;

export interface SavedQueryLibraryItem {
  id: string;
  huntName: string;
  queryDsl: string | null;
  nlQuery: string | null;
  isShared: boolean;
  createdBy: string;
}

function toLibraryItem(row: HaSavedQuery): SavedQueryLibraryItem {
  return {
    id: String(row.id ?? ''),
    huntName: row.queryName,
    queryDsl: row.queryText,
    nlQuery: null,
    isShared: row.isShared === true,
    createdBy: row.userLogin ?? 'unknown',
  };
}

export function useConfirmedSavedQueries(): ReturnType<typeof useQuery<SavedQueryLibraryItem[]>> {
  return useQuery<SavedQueryLibraryItem[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      if (searchHuntFixtureMode) {
        const { foundationSavedHunts } = await import('./searchHunt.fixtures');
        return foundationSavedHunts.map((hunt) => ({
          id: String(hunt.id),
          huntName: hunt.huntName,
          queryDsl: hunt.queryDsl,
          nlQuery: hunt.nlQuery,
          isShared: hunt.isShared,
          createdBy: hunt.createdBy,
        }));
      }
      const rows = await getSavedQueries();
      return rows.map(toLibraryItem);
    },
    retry: 1,
  });
}

export interface CreateSavedQueryInput {
  huntName: string;
  queryDsl: string | null;
  isShared: boolean;
  indexPattern?: string | null;
}

export function useCreateConfirmedSavedQuery(): ReturnType<
  typeof useMutation<SavedQueryLibraryItem, Error, CreateSavedQueryInput>
> {
  const qc = useQueryClient();
  return useMutation<SavedQueryLibraryItem, Error, CreateSavedQueryInput>({
    mutationFn: async (data) => {
      if (searchHuntFixtureMode) {
        return {
          id: `fixture-${Date.now()}`,
          huntName: data.huntName,
          queryDsl: data.queryDsl,
          nlQuery: null,
          isShared: data.isShared,
          createdBy: 'fixture',
        };
      }
      const created = await createSavedQuery({
        queryName: data.huntName.trim(),
        queryText: data.queryDsl?.trim() || '*',
        indexPattern: data.indexPattern ?? null,
        isShared: data.isShared,
      });
      return toLibraryItem(created);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteConfirmedSavedQuery(): ReturnType<
  typeof useMutation<void, Error, string>
> {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (searchHuntFixtureMode) return;
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) {
        throw new Error('Invalid saved query id');
      }
      await deleteSavedQuery(numericId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
