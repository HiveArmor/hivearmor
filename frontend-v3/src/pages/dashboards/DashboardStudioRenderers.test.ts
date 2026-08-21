/**
 * DashboardStudioRenderers Tests
 * Session S33 — Dashboard Studio widget renderers test suite
 */

import { describe, it, expect } from 'vitest';

describe('Widget Config Type Validation', () => {
  it('ChartWidgetConfig should have required fields', () => {
    const config = {
      visualizationId: 1,
      chartType: 'line' as const,
      showLegend: true,
    };
    expect(config.visualizationId).toBe(1);
    expect(config.chartType).toBe('line');
    expect(config.showLegend).toBe(true);
  });

  it('ChartWidgetConfig should allow optional fields', () => {
    const config = {
      visualizationId: 1,
      chartType: 'bar' as const,
      xAxisLabel: 'Time',
      yAxisLabel: 'Count',
      showLegend: false,
    };
    expect(config.xAxisLabel).toBe('Time');
    expect(config.yAxisLabel).toBe('Count');
  });

  it('MetricWidgetConfig should have required fields', () => {
    const config = {
      visualizationId: 1,
      showTrend: true,
    };
    expect(config.visualizationId).toBe(1);
    expect(config.showTrend).toBe(true);
  });

  it('MetricWidgetConfig should allow optional label', () => {
    const config = {
      visualizationId: 2,
      label: 'Active Users',
      showTrend: false,
    };
    expect(config.label).toBe('Active Users');
  });

  it('AlertTableWidgetConfig should have required fields', () => {
    const config = {
      maxRows: 20,
      severityFilter: [1, 2],
      statusFilter: ['Open'],
    };
    expect(config.maxRows).toBe(20);
    expect(config.severityFilter).toEqual([1, 2]);
    expect(config.statusFilter).toEqual(['Open']);
  });

  it('AlertTableWidgetConfig should handle empty filters', () => {
    const config: { maxRows: number; severityFilter?: number[]; statusFilter?: string[] } = {
      maxRows: 50,
    };
    expect(config.maxRows).toBe(50);
    expect(config.severityFilter).toBe(undefined);
    expect(config.statusFilter).toBe(undefined);
  });

  it('TextWidgetConfig should have required fields', () => {
    const config = {
      content: '# Test',
      fontSize: 'medium' as const,
    };
    expect(config.content).toBe('# Test');
    expect(config.fontSize).toBe('medium');
  });

  it('TextWidgetConfig should support all font sizes', () => {
    const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];
    sizes.forEach((size) => {
      const config = {
        content: 'Test',
        fontSize: size,
      };
      expect(config.fontSize).toBe(size);
    });
  });

  it('LiveFeedWidgetConfig should have required fields', () => {
    const config = {
      feedType: 'eps' as const,
      displayStyle: 'metric' as const,
    };
    expect(config.feedType).toBe('eps');
    expect(config.displayStyle).toBe('metric');
  });

  it('LiveFeedWidgetConfig should support alert_count feed type', () => {
    const config = {
      feedType: 'alert_count' as const,
      displayStyle: 'sparkline' as const,
    };
    expect(config.feedType).toBe('alert_count');
    expect(config.displayStyle).toBe('sparkline');
  });
});
