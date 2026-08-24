/**
 * Dashboard domain types for HiveArmor frontend-v3
 */

export interface DashboardDTO {
  id: number;
  name: string;
  description: string | null;
  owner: string; // username string — not a user ID
  isSystem: boolean;
  refreshTime: number | null; // seconds; null means no auto-refresh
  filters: string | null; // JSON-serialised filter object
  visualizations: string; // JSON array of UtmVisualization references
  /** GAP-MT-05: ha_client.id when MSSP-scoped; null = legacy global dashboard */
  tenantId?: number | null;
}

export interface VisualizationDTO {
  id: number;
  name: string;
  description: string | null;
  type: 'CHART' | 'TABLE' | 'MAP' | 'METRIC';
  chartConfig: string; // JSON — parsed at widget render time
  query: string; // JSON — sent to /api/ha-visualizations/run
  width: number; // GridStack columns (1–12)
  height: number; // GridStack rows
  posX: number; // GridStack column position
  posY: number; // GridStack row position
}

export interface VisualizationRunRequest {
  visualizationId: number;
  filters?: FilterDTO | null;
}

export interface FilterDTO {
  // Placeholder for filter structure
  // TODO: Define based on actual filter requirements
  [key: string]: unknown;
}

/** Parsed visualization run payload — typically a list of chart-specific result rows. */
export type ChartDataResponse = unknown;
