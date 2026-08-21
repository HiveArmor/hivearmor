/**
 * constellation.types.test.ts — Constellation types tests
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

describe('constellation.types', () => {
  it('types file exists', () => {
    const typesPath = join(__dirname, 'constellation.types.ts');
    expect(() => readFileSync(typesPath, 'utf-8')).not.toThrow();
  });

  it('exports ConstellationResponse type', () => {
    const typesContent = readFileSync(join(__dirname, 'constellation.types.ts'), 'utf-8');
    expect(typesContent).toContain('export interface ConstellationResponse');
  });

  it('exports GraphNodeDTO type', () => {
    const typesContent = readFileSync(join(__dirname, 'constellation.types.ts'), 'utf-8');
    expect(typesContent).toContain('export interface GraphNodeDTO');
  });

  it('exports GraphEdgeDTO type', () => {
    const typesContent = readFileSync(join(__dirname, 'constellation.types.ts'), 'utf-8');
    expect(typesContent).toContain('export interface GraphEdgeDTO');
  });

  it('includes snapshot, truncation, partial failure, and evidence metadata', () => {
    const typesContent = readFileSync(join(__dirname, 'constellation.types.ts'), 'utf-8');
    expect(typesContent).toContain('snapshotAt?: string');
    expect(typesContent).toContain('truncated?: boolean');
    expect(typesContent).toContain('partialFailures?: ConstellationPartialFailure[]');
    expect(typesContent).toContain('evidenceCount?: number');
  });
});
