/**
 * DashboardStudioPage Tests
 * Session S32 — Dashboard Studio tests
 */

import { describe, it, expect } from 'vitest';

describe('DashboardStudioPage', () => {
  it('should export DashboardStudioPage component', async () => {
    const module = await import('./DashboardStudioPage');
    expect(typeof module.DashboardStudioPage).toBe('function');
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
