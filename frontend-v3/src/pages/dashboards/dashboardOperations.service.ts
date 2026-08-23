import type { DashboardListResult, DashboardPanel, DashboardRecord, DashboardSaveResult } from './dashboardOperations.types';

import { apiClient } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

interface LegacyVisualization {
  id?: number;
  name?: string;
  description?: string;
  chartType?: string | { type?: string };
  eventType?: string;
  modifiedDate?: string;
}

interface LegacyDashboard {
  id: number;
  name: string;
  description?: string;
  refreshTime?: number | null;
  createdDate?: string;
  modifiedDate?: string;
  userCreated?: string;
  userModified?: string;
  systemOwner?: boolean;
  visualizations?: LegacyVisualization[];
}

function normalizePanel(visualization: LegacyVisualization, index: number): DashboardPanel {
  const rawType = typeof visualization.chartType === 'string' ? visualization.chartType : visualization.chartType?.type;
  const normalized = String(rawType ?? '').toLocaleLowerCase();
  const kind: DashboardPanel['kind'] = normalized.includes('table') ? 'table' : normalized.includes('metric') || normalized.includes('card') ? 'metric' : normalized.includes('pie') ? 'donut' : 'line';
  return {
    id: String(visualization.id ?? `legacy-${index}`),
    title: visualization.name ?? `Visualization ${index + 1}`,
    description: visualization.description ?? 'Legacy visualization metadata',
    kind,
    queryLabel: 'Legacy stored visualization',
    source: visualization.eventType ?? 'Source not reported',
    state: 'contract_unavailable',
    updatedAt: visualization.modifiedDate,
    position: { x: (index % 2) * 6, y: Math.floor(index / 2) * 4, w: 6, h: 4 },
  };
}

function normalizeDashboard(item: LegacyDashboard): DashboardRecord {
  const panels = Array.from(item.visualizations ?? []).map(normalizePanel);
  return {
    id: String(item.id),
    title: item.name,
    description: item.description ?? 'No description supplied',
    owner: item.userModified ?? item.userCreated ?? 'Owner not reported',
    managed: Boolean(item.systemOwner),
    access: item.systemOwner ? 'managed' : 'team',
    health: panels.length ? 'unknown' : 'draft',
    tags: [],
    createdAt: item.createdDate,
    updatedAt: item.modifiedDate ?? item.createdDate,
    refreshSeconds: item.refreshTime,
    defaultTimeRange: 'Not reported',
    tenantScope: 'Not reported by legacy contract',
    variables: [],
    panels,
  };
}

export const dashboardOperationsService = {
  fixtureMode,
  async list(signal?: AbortSignal): Promise<DashboardListResult> {
    if (fixtureMode) {
      const { listDashboardFixtures } = await import('./dashboardOperations.fixtures');
      const items = listDashboardFixtures();
      return { items, total: items.length, bounded: true, tenantScoped: true, serverSorted: true };
    }
    const items = await apiClient.get<LegacyDashboard[]>('/ha-dashboards?page=0&size=100&sort=modifiedDate,desc', { signal });
    return { items: items.map(normalizeDashboard), total: items.length, bounded: true, tenantScoped: false, serverSorted: true };
  },
  async get(id: string, signal?: AbortSignal): Promise<DashboardRecord> {
    if (fixtureMode) {
      const { getDashboardFixture } = await import('./dashboardOperations.fixtures');
      const item = getDashboardFixture(id);
      if (!item) throw new Error('Dashboard not found');
      return item;
    }
    return normalizeDashboard(await apiClient.get<LegacyDashboard>(`/ha-dashboards/${encodeURIComponent(id)}`, { signal }));
  },
  async save(dashboard: DashboardRecord): Promise<DashboardSaveResult> {
    if (!fixtureMode) throw new Error('Canonical versioned dashboard save contract is unavailable');
    const { saveDashboardFixture } = await import('./dashboardOperations.fixtures');
    return { dashboard: saveDashboardFixture(dashboard), fixtureOnly: true };
  },
};
