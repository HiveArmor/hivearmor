/**
 * DashboardStudioPage Tests — Prompt 32 / Wave C1 slice 2
 */

import { describe, it, expect } from 'vitest';

import { DASHBOARD_STUDIO_JOB_SENTENCE, DashboardStudioPage } from './DashboardStudioPage';

describe('DashboardStudioPage', () => {
  it('should export DashboardStudioPage component', () => {
    expect(DashboardStudioPage).toBeDefined();
    expect(typeof DashboardStudioPage).toBe('function');
  });

  it('exports Studio job sentence distinct from gallery and reports', () => {
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).toMatch(/Dashboard Studio/i);
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).toMatch(/Gallery|Dashboards/i);
    expect(DASHBOARD_STUDIO_JOB_SENTENCE).toMatch(/Reports|reporting/i);
  });
});

describe('DashboardCanvas', () => {
  it('should export DashboardCanvas component', async () => {
    const module = await import('./studio/DashboardCanvas');
    expect(typeof module.DashboardCanvas).toBe('function');
  });
});

describe('WidgetCatalogue', () => {
  it('should export WidgetCatalogue component', async () => {
    const module = await import('./studio/WidgetCatalogue');
    expect(typeof module.WidgetCatalogue).toBe('function');
  });
});

describe('widgetTypes.constants', () => {
  it('should export WIDGET_TYPES constant', async () => {
    const module = await import('./studio/widgetTypes.constants');
    expect(Array.isArray(module.WIDGET_TYPES)).toBe(true);
    expect(module.WIDGET_TYPES.length > 0).toBe(true);
  });
});

describe('WidgetContainer', () => {
  it('should export WidgetContainer component', async () => {
    const module = await import('./studio/WidgetContainer');
    expect(typeof module.WidgetContainer).toBe('function');
  });
});

describe('WidgetConfigPanel', () => {
  it('should export WidgetConfigPanel component', async () => {
    const module = await import('./studio/WidgetConfigPanel');
    expect(typeof module.WidgetConfigPanel).toBe('function');
  });
});
