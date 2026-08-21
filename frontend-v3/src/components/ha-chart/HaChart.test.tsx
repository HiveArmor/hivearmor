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
});
