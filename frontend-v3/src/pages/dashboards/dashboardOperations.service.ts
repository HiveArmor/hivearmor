import type {
  DashboardListResult,
  DashboardPanel,
  DashboardPanelData,
  DashboardPanelKind,
  DashboardRecord,
  DashboardSaveResult,
} from './dashboardOperations.types';
import { GAP_SEC_06_RESOLVED, canRunVisualization, runVisualization } from './dashboards.service';

import { apiClient } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export interface LegacyVisualization {
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
  /** GAP-MT-05: present when backend returns tenant-scoped dashboards */
  tenantId?: number | null;
  visualizations?: LegacyVisualization[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Map a legacy dashboard visualization into a panel definition.
 * Panels with a numeric visualization id are executable via authorized run (F01/F11).
 * Panels without an id stay `contract_unavailable` — no fake data.
 */
export function normalizeLegacyPanel(visualization: LegacyVisualization, index: number): DashboardPanel {
  const rawType = typeof visualization.chartType === 'string' ? visualization.chartType : visualization.chartType?.type;
  const normalized = String(rawType ?? '').toLocaleLowerCase();
  const kind: DashboardPanel['kind'] =
    normalized.includes('table') || normalized.includes('list')
      ? 'table'
      : normalized.includes('metric') || normalized.includes('card') || normalized.includes('gauge') || normalized.includes('goal')
        ? 'metric'
        : normalized.includes('pie') || normalized.includes('tag_cloud')
          ? 'donut'
          : normalized.includes('bar')
            ? 'bar'
            : 'line';

  const visualizationId = typeof visualization.id === 'number' && Number.isFinite(visualization.id) ? visualization.id : undefined;

  return {
    id: visualizationId !== undefined ? String(visualizationId) : `legacy-${index}`,
    title: visualization.name ?? `Visualization ${index + 1}`,
    description: visualization.description ?? 'Legacy visualization metadata',
    kind,
    queryLabel: visualizationId !== undefined ? 'Authorized visualization run' : 'Legacy stored visualization',
    source: visualization.eventType ?? 'Source not reported',
    state: visualizationId !== undefined ? 'ready' : 'contract_unavailable',
    visualizationId,
    updatedAt: visualization.modifiedDate,
    position: { x: (index % 2) * 6, y: Math.floor(index / 2) * 4, w: 6, h: 4 },
  };
}

function normalizeDashboard(item: LegacyDashboard): DashboardRecord {
  const panels = Array.from(item.visualizations ?? []).map(normalizeLegacyPanel);
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
    tenantScope:
      item.tenantId != null ? `tenantId=${item.tenantId}` : 'Not reported by legacy contract',
    variables: [],
    panels,
  };
}

/**
 * Convert `/ha-visualizations/run` payload into panel render data.
 * Returns undefined only when the response shape cannot be projected for the panel kind
 * (caller should show an honest error — never invent rows).
 */
export function mapVisualizationRunToPanelData(
  kind: DashboardPanelKind,
  raw: unknown,
): DashboardPanelData | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  if (kind === 'metric') {
    const first = raw[0];
    if (!isRecord(first)) {
      return { kind: 'metric', value: '0', context: 'No metric rows returned' };
    }
    const value = first.value;
    if (typeof value !== 'number' && typeof value !== 'string') {
      return { kind: 'metric', value: '0', context: 'No metric rows returned' };
    }
    return {
      kind: 'metric',
      value: String(value),
      context: typeof first.bucketKey === 'string' ? first.bucketKey : 'Metric result',
    };
  }

  if (kind === 'donut') {
    const labels: string[] = [];
    const values: number[] = [];
    for (const row of raw) {
      if (!isRecord(row)) continue;
      labels.push(typeof row.bucketKey === 'string' ? row.bucketKey : 'Unknown');
      values.push(typeof row.value === 'number' ? row.value : 0);
    }
    return { kind: 'distribution', labels, values };
  }

  if (kind === 'line' || kind === 'bar') {
    const first = raw[0];
    if (!isRecord(first)) {
      return { kind: 'series', labels: [], series: [] };
    }
    const labels = Array.isArray(first.categories)
      ? first.categories.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const seriesRaw = Array.isArray(first.series) ? first.series : [];
    const series = seriesRaw.filter(isRecord).map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : 'Series',
      values: Array.isArray(entry.data)
        ? entry.data.map((n) => (typeof n === 'number' ? n : 0))
        : [],
    }));
    return { kind: 'series', labels, series };
  }

  if (kind === 'table') {
    const first = raw[0];
    if (!isRecord(first)) {
      return { kind: 'table', columns: [], rows: [] };
    }
    const columns = Array.isArray(first.columns)
      ? first.columns.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const rows: Array<Record<string, string | number>> = [];
    if (Array.isArray(first.rows)) {
      for (const row of first.rows) {
        if (!Array.isArray(row)) continue;
        const record: Record<string, string | number> = {};
        columns.forEach((column, index) => {
          const cell = row[index];
          if (isRecord(cell) && (typeof cell.value === 'string' || typeof cell.value === 'number')) {
            record[column] = cell.value;
          } else if (typeof cell === 'string' || typeof cell === 'number') {
            record[column] = cell;
          } else {
            record[column] = '';
          }
        });
        rows.push(record);
      }
    }
    return { kind: 'table', columns, rows };
  }

  // feed / text panels are not backed by visualization run
  return undefined;
}

/** Whether the current principal may execute panel visualization queries. */
export function canExecuteDashboardPanels(roles: readonly string[] | undefined | null): boolean {
  return GAP_SEC_06_RESOLVED && canRunVisualization(roles);
}

/**
 * Load a stored visualization definition and execute it via the role-gated run endpoint.
 */
export async function executePanelVisualization(visualizationId: number): Promise<unknown> {
  return runVisualization({ visualizationId, filters: null });
}

export const dashboardOperationsService = {
  fixtureMode,
  async list(signal?: AbortSignal): Promise<DashboardListResult> {
    if (fixtureMode) {
      const { listDashboardFixtures } = await import('./dashboardOperations.fixtures');
      const items = listDashboardFixtures();
      return { items, total: items.length, bounded: true, tenantScoped: true, serverSorted: true };
    }
    const items = await apiClient.get<LegacyDashboard[]>('/ha-dashboards?page=0&size=100&sort=modifiedDate,desc', {
      signal,
    });
    return {
      items: items.map(normalizeDashboard),
      total: items.length,
      // Legacy list returns an array without X-Total-Count — do not claim a bounded page.
      bounded: false,
      tenantScoped: false,
      serverSorted: true,
    };
  },
  async get(id: string, signal?: AbortSignal): Promise<DashboardRecord> {
    if (fixtureMode) {
      const { getDashboardFixture } = await import('./dashboardOperations.fixtures');
      const item = getDashboardFixture(id);
      if (!item) throw new Error('Dashboard not found');
      return item;
    }
    return normalizeDashboard(
      await apiClient.get<LegacyDashboard>(`/ha-dashboards/${encodeURIComponent(id)}`, { signal }),
    );
  },
  async save(dashboard: DashboardRecord): Promise<DashboardSaveResult> {
    if (!fixtureMode) throw new Error('Canonical versioned dashboard save contract is unavailable');
    const { saveDashboardFixture } = await import('./dashboardOperations.fixtures');
    return { dashboard: saveDashboardFixture(dashboard), fixtureOnly: true };
  },
};
