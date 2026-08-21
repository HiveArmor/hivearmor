import type { AssetFilters, AssetListResponse } from '../posture.types';

export function getFoundationAssetPage(_filters: AssetFilters, page: number, _size: number, _sort?: string): AssetListResponse {
  return { content: [], totalElements: 0, totalPages: 0, number: page };
}
