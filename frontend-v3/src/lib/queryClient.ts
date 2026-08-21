/**
 * TanStack Query Client Configuration
 * Global query client with error handling and retry logic.
 */

import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './apiClient';
import { showErrorToast } from './toast';

import { useAuthStore } from '@/store/auth.store';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      gcTime: 5 * 60_000, // 5 minutes
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        if (error instanceof ApiError) {
          showErrorToast(error.body.detail ?? error.body.message ?? 'An error occurred');
        }
      },
    },
  },
});

// Invalidate all queries when tenant changes — ensures stale data from previous
// tenant scope is flushed and all visible components refetch with the new scope.
let previousTenantId: number | null = useAuthStore.getState().selectedTenantId;
useAuthStore.subscribe((state) => {
  if (state.selectedTenantId !== previousTenantId) {
    previousTenantId = state.selectedTenantId;
    queryClient.invalidateQueries();
  }
});
