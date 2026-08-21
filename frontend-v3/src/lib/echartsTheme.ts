/**
 * HiveArmor ECharts theme bridge.
 *
 * Canvas renderers cannot consume CSS custom properties directly, so this
 * module resolves the active semantic tokens at registration time. No chart
 * element owns a raw colour value and dark/light palettes stay synchronized
 * with the application foundation.
 */

import * as echarts from 'echarts';

import type { HaTheme } from '@/store/theme.store';

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createHiveArmorEchartsTheme(): Record<string, unknown> {
  const primary = token('--ha-action-primary');
  const medium = token('--ha-severity-medium');
  const healthy = token('--ha-state-healthy');
  const high = token('--ha-severity-high');
  const critical = token('--ha-severity-critical');
  const intelligence = token('--ha-intelligence-primary');
  const app = token('--ha-surface-app');
  const elevated = token('--ha-surface-elevated');
  const borderSubtle = token('--ha-border-subtle');
  const borderDefault = token('--ha-border-default');
  const borderStrong = token('--ha-border-strong');
  const foreground = token('--ha-foreground-primary');
  const secondary = token('--ha-foreground-secondary');
  const tertiary = token('--ha-foreground-tertiary');

  return {
    color: [primary, medium, healthy, high, critical, intelligence],
    backgroundColor: 'transparent',
    textStyle: {
      color: foreground,
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: 12,
    },
    title: {
      textStyle: { color: foreground, fontSize: 14, fontWeight: 600 },
      subtextStyle: { color: secondary, fontSize: 12 },
    },
    legend: {
      textStyle: { color: secondary, fontSize: 12 },
      itemStyle: { opacity: 1 },
      pageTextStyle: { color: secondary },
      pageIconColor: primary,
      pageIconInactiveColor: borderStrong,
    },
    grid: { borderColor: borderDefault },
    categoryAxis: {
      axisLine: { lineStyle: { color: borderDefault } },
      axisTick: { lineStyle: { color: borderDefault } },
      axisLabel: { color: tertiary, fontSize: 11 },
      splitLine: { lineStyle: { color: borderSubtle } },
      splitArea: { areaStyle: { color: [withAlpha(borderSubtle, 0.35), 'transparent'] } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: borderDefault } },
      axisTick: { lineStyle: { color: borderDefault } },
      axisLabel: { color: tertiary, fontSize: 11 },
      splitLine: { lineStyle: { color: borderSubtle, type: 'dashed' } },
      splitArea: { areaStyle: { color: [withAlpha(borderSubtle, 0.25), 'transparent'] } },
    },
    timeAxis: {
      axisLine: { lineStyle: { color: borderDefault } },
      axisTick: { lineStyle: { color: borderDefault } },
      axisLabel: { color: tertiary, fontSize: 11 },
      splitLine: { lineStyle: { color: borderSubtle, type: 'dashed' } },
    },
    tooltip: {
      backgroundColor: elevated,
      borderColor: borderStrong,
      borderWidth: 1,
      textStyle: { color: foreground, fontSize: 12 },
      extraCssText: 'box-shadow: var(--ha-shadow-control);',
    },
    line: {
      itemStyle: { borderWidth: 2 },
      lineStyle: { width: 2 },
      symbolSize: 6,
      symbol: 'circle',
      smooth: false,
    },
    bar: {
      itemStyle: { borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 40,
    },
    pie: {
      itemStyle: { borderColor: app, borderWidth: 2 },
      label: { color: foreground },
      labelLine: { lineStyle: { color: borderDefault } },
    },
    gauge: {
      axisTick: { lineStyle: { color: borderDefault } },
      axisLine: { lineStyle: { color: [[1, borderDefault]] } },
      splitLine: { lineStyle: { color: borderDefault } },
      pointer: { itemStyle: { color: primary } },
      title: { color: secondary },
      detail: { color: foreground },
    },
  };
}

/** Registers and returns the mode-specific theme name used by HaChart. */
export function registerHiveArmorTheme(theme: HaTheme): string {
  const name = `hivearmor-${theme}`;
  echarts.registerTheme(name, createHiveArmorEchartsTheme());
  return name;
}
