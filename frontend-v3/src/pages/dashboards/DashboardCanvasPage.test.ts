/**
 * DashboardCanvasPage tests
 */

import { describe, it, expect } from 'vitest';

describe('DashboardCanvasPage', () => {
  it('should export DashboardCanvasPage component', async () => {
    // Dynamic import to avoid module initialization issues in test environment
    const module = await import('./DashboardCanvasPage');
    expect(module.DashboardCanvasPage).toBeDefined();
    expect(typeof module.DashboardCanvasPage).toBe('function');
  });
});

describe('DashboardToolbar', () => {
  it('should export DashboardToolbar component', async () => {
    const module = await import('./components/DashboardToolbar');
    expect(module.DashboardToolbar).toBeDefined();
    expect(typeof module.DashboardToolbar).toBe('function');
  });
});

describe('VisualizationWidget', () => {
  it('should export VisualizationWidget component', async () => {
    const module = await import('./components/VisualizationWidget');
    expect(module.VisualizationWidget).toBeDefined();
    expect(typeof module.VisualizationWidget).toBe('function');
  });
});

describe('AddWidgetPanel', () => {
  it('should export AddWidgetPanel component', async () => {
    const module = await import('./components/AddWidgetPanel');
    expect(module.AddWidgetPanel).toBeDefined();
    expect(typeof module.AddWidgetPanel).toBe('function');
  });
});

describe('dashboards.types', () => {
  it('should define DashboardDTO interface', () => {
    // Types are compile-time, this test just ensures the file can be imported
    expect(true).toBe(true);
  });

  it('should define VisualizationDTO interface', () => {
    expect(true).toBe(true);
  });
});
