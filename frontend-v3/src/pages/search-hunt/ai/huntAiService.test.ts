/**
 * huntAiService (mock mode) + contract honesty tests.
 *  - the mock returns a contract-shaped, ready verdict WITH calibration (never a naked score);
 *  - field provenance separates raw from model/enrichment (the "show AI's hand" lens);
 *  - the AI source files contain no hex literals and no `any` (design-system + type honesty).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { fetchHuntVerdict, fetchFieldProvenance, HUNT_AI_MODE } from './huntAiService';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('huntAiService (mock)', () => {
  it('defaults to mock mode (agent backend not yet wired)', () => {
    expect(HUNT_AI_MODE).toBe('mock');
  });

  it('returns a ready verdict that carries calibration (confidence never stands alone)', async () => {
    const v = await fetchHuntVerdict({ searchId: 'HUNT-1' });
    expect(v.state).toBe('ready');
    expect(v.confidence).toBeGreaterThan(0);
    expect(v.calibration).toBeDefined();
    expect(v.calibration.agreementRate).toBeGreaterThan(0);
    expect(v.calibration.sampleSize).toBeGreaterThan(0);
    // reasoning steps can cite rows (move 3)
    expect(v.reasoning.some((r) => (r.rowRefs?.length ?? 0) > 0)).toBe(true);
    // scoped to the live search
    expect(v.verdictId).toContain('HUNT-1');
  });

  it('field provenance distinguishes model/enrichment from raw', async () => {
    const fp = await fetchFieldProvenance('HUNT-1');
    expect(fp.some((f) => f.origin === 'raw')).toBe(true);
    expect(fp.some((f) => f.origin === 'model' || f.origin === 'enrichment')).toBe(true);
  });
});

describe('hunt AI source honesty', () => {
  const files = ['huntAiContract.types.ts', 'huntAiContract.fixtures.ts', 'huntAiService.ts'];
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  for (const f of files) {
    it(`${f} contains no raw hex color literals`, () => {
      const src = stripComments(readFileSync(join(HERE, f), 'utf8'));
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
    it(`${f} contains no \`any\` type`, () => {
      const src = stripComments(readFileSync(join(HERE, f), 'utf8'));
      expect(src).not.toMatch(/[:<]\s*any\b/);
    });
  }
});
