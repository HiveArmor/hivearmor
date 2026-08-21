import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));


describe('FilterBuilder', () => {
  it('component file exists', () => {
    expect(existsSync(join(__dirname, 'FilterBuilder.tsx'))).toBe(true);
  });

  it('exports FilterBuilder', () => {
    const src = readFileSync(join(__dirname, 'FilterBuilder.tsx'), 'utf-8');
    expect(src.includes('export function FilterBuilder') || src.includes('export const FilterBuilder')).toBe(true);
  });

  it('no hardcoded hex colors', () => {
    const src = readFileSync(join(__dirname, 'FilterBuilder.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{6}\b/)).toBeFalsy();
  });

  it('exports FieldDefinition and FilterClause types', () => {
    const src = readFileSync(join(__dirname, 'FilterBuilder.tsx'), 'utf-8');
    expect(src.includes('FieldDefinition')).toBe(true);
        expect(src.includes('FilterClause')).toBe(true);
  });
});
