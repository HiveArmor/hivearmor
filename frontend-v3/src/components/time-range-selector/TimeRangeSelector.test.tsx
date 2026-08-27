import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));


describe('TimeRangeSelector', () => {
  it('component file exists', () => {
    expect(existsSync(join(__dirname, 'TimeRangeSelector.tsx'))).toBe(true);
  });

  it('exports TimeRangeSelector', () => {
    const src = readFileSync(join(__dirname, 'TimeRangeSelector.tsx'), 'utf-8');
    expect(src.includes('export function TimeRangeSelector') || src.includes('export const TimeRangeSelector')).toBe(true);
  });

  it('no hardcoded hex colors', () => {
    const src = readFileSync(join(__dirname, 'TimeRangeSelector.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{6}\b/)).toBeFalsy();
  });

  it('uses AbsoluteCalendarFields for Absolute tab', () => {
    const src = readFileSync(join(__dirname, 'TimeRangeSelector.tsx'), 'utf-8');
    expect(src.includes('AbsoluteCalendarFields')).toBe(true);
    expect(src.includes('type="text"')).toBeFalsy();
  });
});
