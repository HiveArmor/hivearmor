/**
 * useOpenAlertCount Hook
 * Fetches the count of open alerts using TanStack Query.
 * Refetches every 30 seconds to keep the masthead badge current.
 */

import { useQuery } from '@tanstack/react-query';

import { QUERY_KEYS } from '@/constants/api.constants';
import { getOpenAlertCount } from '@/services/alerts.service';

export interface UseOpenAlertCountResult {
  count: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useOpenAlertCount(): UseOpenAlertCountResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.alertCount,
    queryFn: getOpenAlertCount,
    refetchInterval: 30_000, // refetch every 30 seconds
    staleTime: 20_000, // consider data stale after 20 seconds
  });

  return {
    count: data ?? 0,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
