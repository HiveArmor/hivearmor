export type DashboardAccess = 'managed' | 'team' | 'private';
export type DashboardHealth = 'healthy' | 'degraded' | 'draft' | 'unknown';
export type DashboardPanelKind = 'metric' | 'line' | 'bar' | 'donut' | 'table' | 'feed' | 'text';
export type DashboardPanelState = 'ready' | 'stale' | 'partial' | 'contract_unavailable';

export interface DashboardVariable {
  id: string;
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
}

export type DashboardPanelData =
  | { kind: 'metric'; value: string; delta?: string; trend?: 'up' | 'down' | 'flat'; context: string }
  | { kind: 'series'; labels: string[]; series: Array<{ name: string; values: number[] }> }
  | { kind: 'distribution'; labels: string[]; values: number[] }
  | { kind: 'table'; columns: string[]; rows: Array<Record<string, string | number>> }
  | { kind: 'feed'; rows: Array<{ time: string; severity: string; summary: string }> }
  | { kind: 'text'; body: string };

export interface DashboardPanel {
  id: string;
  title: string;
  description: string;
  kind: DashboardPanelKind;
  queryLabel: string;
  source: string;
  state: DashboardPanelState;
  /** Present when the panel maps to a stored visualization that `/ha-visualizations/run` can execute. */
  visualizationId?: number;
  updatedAt?: string;
  drilldown?: string;
  position: { x: number; y: number; w: number; h: number };
  data?: DashboardPanelData;
}

export interface DashboardRecord {
  id: string;
  title: string;
  description: string;
  owner: string;
  managed: boolean;
  access: DashboardAccess;
  health: DashboardHealth;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  lastViewedAt?: string;
  version?: number;
  refreshSeconds?: number | null;
  defaultTimeRange: string;
  tenantScope: string;
  sourceCount?: number;
  variables: DashboardVariable[];
  panels: DashboardPanel[];
}

export interface DashboardListResult {
  items: DashboardRecord[];
  total: number;
  bounded: boolean;
  tenantScoped: boolean;
  serverSorted: boolean;
}

export interface DashboardSaveResult {
  dashboard: DashboardRecord;
  fixtureOnly: boolean;
}
