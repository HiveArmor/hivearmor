import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));


describe('EvidenceCard', () => {
  it('component file exists', () => {
    expect(existsSync(join(__dirname, 'EvidenceCard.tsx'))).toBe(true);
  });

  it('exports EvidenceCard', () => {
    const src = readFileSync(join(__dirname, 'EvidenceCard.tsx'), 'utf-8');
    expect(src.includes('export function EvidenceCard') || src.includes('export const EvidenceCard')).toBe(true);
  });

  it('no hardcoded hex colors', () => {
    const src = readFileSync(join(__dirname, 'EvidenceCard.tsx'), 'utf-8');
    expect(src.match(/#[0-9a-fA-F]{6}\b/)).toBeFalsy();
  });

  it('has index.ts', () => {
    expect(existsSync(join(__dirname, 'index.ts'))).toBe(true);
  });
});
