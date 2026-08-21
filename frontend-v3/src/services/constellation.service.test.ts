/**
 * constellation.service.test.ts — Constellation service tests
 */

import { describe, expect, it } from 'vitest';

import { constellationService } from './constellation.service';

describe('constellation.service', () => {
  it('service file exists', () => {
    expect(constellationService).toBeDefined();
  });

  it('exports getConstellation function', () => {
    expect(typeof constellationService.getConstellation).toBe('function');
  });
});
