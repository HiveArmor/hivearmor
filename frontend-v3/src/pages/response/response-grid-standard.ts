/**
 * Shared Response Automation grid density contract.
 *
 * Two-line operational cells need a 42px standard row to preserve both the
 * primary value and its provenance line without touching the row border.
 */
export type ResponseGridDensity = 'compact' | 'standard' | 'comfortable';

export const RESPONSE_GRID_ROW_HEIGHTS: Record<ResponseGridDensity, number> = {
  compact: 36,
  standard: 42,
  comfortable: 48,
};

export const RESPONSE_GRID_DEFAULT_ROW_HEIGHT = RESPONSE_GRID_ROW_HEIGHTS.standard;
