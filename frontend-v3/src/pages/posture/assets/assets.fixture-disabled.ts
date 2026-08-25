import type { AssetFilters, AssetListResponse } from '../posture.types';

/**
 * Production build alias target. Fictional asset inventory must never ship in prod bundles.
 */
export function getFoundationAssetPage(
  _filters: AssetFilters,
  _page: number,
  _size: number,
  _sort?: string
): AssetListResponse {
  throw new Error('Asset foundation fixtures are excluded from production builds.');
}
