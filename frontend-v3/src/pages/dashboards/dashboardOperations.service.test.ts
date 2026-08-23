/**
 * Dashboard operations / panel execution tests (F11)
 */

import { describe, it, expect } from 'vitest';

import {
  canExecuteDashboardPanels,
  mapVisualizationRunToPanelData,
  normalizeLegacyPanel,
} from './dashboardOperations.service';
import { GAP_SEC_06_RESOLVED, canRunVisualization, VISUALIZATION_RUN_ROLES } from './dashboards.service';

describe('normalizeLegacyPanel', () => {
  it('marks panels with a visualization id as ready for authorized run', () => {
    const panel = normalizeLegacyPanel(
      {
        id: 42,
        name: 'Open alerts',
        description: 'Count of open alerts',
        chartType: 'METRIC_CHART',
        eventType: 'Alert',
        modifiedDate: '2026-08-21T11:00:00.000Z',
      },
      0,
    );

    expect(panel.visualizationId).toBe(42);
    expect(panel.state).toBe('ready');
    expect(panel.kind).toBe('metric');
    expect(panel.queryLabel).toBe('Authorized visualization run');
    expect(panel.data).toBeUndefined();
  });

  it('keeps panels without a visualization id as contract_unavailable', () => {
    const panel = normalizeLegacyPanel(
      {
        name: 'Orphan panel',
        chartType: 'LINE_CHART',
      },
      3,
    );

    expect(panel.visualizationId).toBeUndefined();
    expect(panel.state).toBe('contract_unavailable');
    expect(panel.id).toBe('legacy-3');
    expect(panel.kind).toBe('line');
  });

  it('maps pie chart types to donut panels', () => {
    const panel = normalizeLegacyPanel({ id: 7, chartType: { type: 'PIE_CHART' } }, 1);
    expect(panel.kind).toBe('donut');
    expect(panel.visualizationId).toBe(7);
  });
});

describe('mapVisualizationRunToPanelData', () => {
  it('maps metric chart results', () => {
    const data = mapVisualizationRunToPanelData('metric', [
      { metricId: 'count', value: 184, bucketKey: 'all', bucketId: 'b1' },
    ]);
    expect(data).toEqual({
      kind: 'metric',
      value: '184',
      context: 'all',
    });
  });

  it('maps empty metric results without inventing a non-zero value', () => {
    const data = mapVisualizationRunToPanelData('metric', []);
    expect(data).toEqual({
      kind: 'metric',
      value: '0',
      context: 'No metric rows returned',
    });
  });

  it('maps pie/donut results', () => {
    const data = mapVisualizationRunToPanelData('donut', [
      { bucketKey: 'Critical', value: 9 },
      { bucketKey: 'High', value: 18 },
    ]);
    expect(data).toEqual({
      kind: 'distribution',
      labels: ['Critical', 'High'],
      values: [9, 18],
    });
  });

  it('maps bar/line series results', () => {
    const data = mapVisualizationRunToPanelData('line', [
      {
        categories: ['08:00', '09:00'],
        series: [{ name: 'Alerts', data: [18, 27] }],
      },
    ]);
    expect(data).toEqual({
      kind: 'series',
      labels: ['08:00', '09:00'],
      series: [{ name: 'Alerts', values: [18, 27] }],
    });
  });

  it('maps table results including cell wrappers', () => {
    const data = mapVisualizationRunToPanelData('table', [
      {
        columns: ['Host', 'Count'],
        rows: [
          [{ value: 'workstation-1', isMetric: false }, { value: 3, isMetric: true }],
        ],
      },
    ]);
    expect(data).toEqual({
      kind: 'table',
      columns: ['Host', 'Count'],
      rows: [{ Host: 'workstation-1', Count: 3 }],
    });
  });

  it('returns undefined for non-array payloads (honest failure path)', () => {
    expect(mapVisualizationRunToPanelData('metric', { value: 1 })).toBeUndefined();
  });

  it('returns undefined for feed/text kinds that have no run projection', () => {
    expect(mapVisualizationRunToPanelData('feed', [])).toBeUndefined();
    expect(mapVisualizationRunToPanelData('text', [])).toBeUndefined();
  });
});

describe('canExecuteDashboardPanels', () => {
  it('requires GAP_SEC_06 resolved and an analyst-tier role', () => {
    expect(GAP_SEC_06_RESOLVED).toBe(true);
    expect(canExecuteDashboardPanels(['ROLE_ANALYST'])).toBe(true);
    expect(canExecuteDashboardPanels(['ROLE_ADMIN'])).toBe(true);
    expect(canExecuteDashboardPanels(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canExecuteDashboardPanels(['ROLE_USER'])).toBe(false);
    expect(canExecuteDashboardPanels(['ROLE_READ_ONLY'])).toBe(false);
    expect(canExecuteDashboardPanels(undefined)).toBe(false);
  });

  it('aligns with canRunVisualization role list', () => {
    for (const role of VISUALIZATION_RUN_ROLES) {
      expect(canRunVisualization([role])).toBe(true);
      expect(canExecuteDashboardPanels([role])).toBe(true);
    }
  });
});

describe('DashboardPanelRenderer', () => {
  it('exports DashboardPanelRenderer', async () => {
    const module = await import('./DashboardPanelRenderer');
    expect(typeof module.DashboardPanelRenderer).toBe('function');
  });
});
