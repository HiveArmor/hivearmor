import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));


describe('SeverityLabel', () => {
  it('component file exists', () => {
    expect(existsSync(join(__dirname, 'SeverityLabel.tsx'))).toBe(true);
  });

  it('exports SeverityLabel', () => {
    const src = readFileSync(join(__dirname, 'SeverityLabel.tsx'), 'utf-8');
    expect(src.includes('export function SeverityLabel')).toBe(true);
  });

  it('no hardcoded hex colors', () => {
    const src = readFileSync(join(__dirname, 'SeverityLabel.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{6}\b/)).toBeFalsy();
  });

  it('uses import type', () => {
    const src = readFileSync(join(__dirname, 'SeverityLabel.tsx'), 'utf-8');
    expect(src.includes('import type')).toBe(true);
  });
});
