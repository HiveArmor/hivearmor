import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));


describe('HaChart', () => {
  it('component file exists', () => {
    expect(existsSync(join(__dirname, 'HaChart.tsx'))).toBe(true);
  });

  it('exports HaChart', () => {
    const src = readFileSync(join(__dirname, 'HaChart.tsx'), 'utf-8');
    expect(src.includes('export function HaChart') || src.includes('export const HaChart')).toBe(true);
  });

  it('no hardcoded hex colors', () => {
    const src = readFileSync(join(__dirname, 'HaChart.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{6}\b/)).toBeFalsy();
  });

  it('has index.ts', () => {
    expect(existsSync(join(__dirname, 'index.ts'))).toBe(true);
  });

  it('exposes accessible chart description for screen readers', () => {
    const src = readFileSync(join(__dirname, 'HaChart.tsx'), 'utf-8');
    expect(src).toContain('role="img"');
    expect(src).toContain('aria-label={ariaLabel');
    expect(src).toContain('aria-describedby');
  });

  it('applies height/width to the outer wrapper so height:100% resolves against the real container', () => {
    // Regression guard: if only the inner ReactECharts div carries the size, the untethered wrapper
    // collapses and ECharts falls back to its default 100px, clipping sized containers (e.g. the hunt
    // histogram). The wrapper (role="img") must carry the dimensions.
    const src = readFileSync(join(__dirname, 'HaChart.tsx'), 'utf-8');
    const wrapper = src.slice(src.indexOf('role="img"'), src.indexOf('<ReactECharts'));
    expect(wrapper).toContain('height:');
    expect(wrapper).toContain('width:');
  });
});
