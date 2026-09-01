import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));


describe('SiemDataGrid', () => {
  it('component file exists', () => {
    expect(existsSync(join(__dirname, 'SiemDataGrid.tsx'))).toBe(true);
  });

  it('exports SiemDataGrid', () => {
    const src = readFileSync(join(__dirname, 'SiemDataGrid.tsx'), 'utf-8');
    expect(src.includes('export function SiemDataGrid') || src.includes('export const SiemDataGrid') || src.includes('AgGridReact')).toBe(true);
  });

  it('uses import type for ag-grid types', () => {
    const src = readFileSync(join(__dirname, 'SiemDataGrid.tsx'), 'utf-8');
    expect(src.includes('import type')).toBe(true);
  });

  it('selects AG Grid theme class from useThemeStore', () => {
    const src = readFileSync(join(__dirname, 'SiemDataGrid.tsx'), 'utf-8');
    expect(src).toContain('useThemeStore');
    expect(src).toContain("theme === 'light' ? 'ag-theme-quartz' : 'ag-theme-quartz-dark'");
    expect(src).not.toContain('className={`ag-theme-quartz-dark ha-grid');
  });

  it('no hardcoded hex colors', () => {
    const src = readFileSync(join(__dirname, 'SiemDataGrid.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{6}\b/)).toBeFalsy();
  });
});
