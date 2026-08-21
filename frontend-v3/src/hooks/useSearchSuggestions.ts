/**
 * TanStack Query hook for HiveArmor AI-suggested searches.
 * Caches suggestions for 15 minutes; never retries on failure.
 *
 * Requirements: 12.1, 12.2, 12.3, 16.1
 */

import { useQuery } from '@tanstack/react-query';

import { getSuggestions } from '@/services/searchService';
import type { SuggestedSearch } from '@/types/search.types';

/**
 * Fetches AI-generated search suggestions for the given index pattern.
 *
 * @param indexPattern - OpenSearch index pattern to generate suggestions for
 * @param count        - Number of suggestions to request (default 5)
 * @returns TanStack Query result with `data: SuggestedSearch[] | undefined`
 */
export function useSearchSuggestions(indexPattern: string, count?: number) {
  return useQuery<SuggestedSearch[]>({
    queryKey: ['search-suggestions', indexPattern, count ?? 5],
    queryFn: () => getSuggestions(indexPattern, count),
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
}
