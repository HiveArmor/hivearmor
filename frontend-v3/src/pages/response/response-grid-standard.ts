/**
 * Shared Response Automation grid density contract.
 * Alias of platform {@link ROW_HEIGHTS} / {@code ha_row_density} (compact 32 / standard 40 / comfortable 48).
 */
import { ROW_HEIGHTS, type RowDensity } from '@/hooks/useRowDensity';

export type ResponseGridDensity = RowDensity;

export const RESPONSE_GRID_ROW_HEIGHTS: Record<ResponseGridDensity, number> = ROW_HEIGHTS;

export const RESPONSE_GRID_DEFAULT_ROW_HEIGHT = ROW_HEIGHTS.standard;
