/**
 * Basic test for entities.service — validates structure and imports.
 */

import { describe, expect, it } from 'vitest';

import * as entitiesService from './entities.service';

describe('entities.service', () => {
  it('service file exists', () => {
    expect(entitiesService).toBeDefined();
  });

  it('exports all required functions', () => {
    expect(entitiesService.fetchEntities).toBeDefined();
    expect(entitiesService.fetchEntityDetail).toBeDefined();
    expect(entitiesService.fetchEntityAlerts).toBeDefined();
    expect(entitiesService.fetchEntityEvents).toBeDefined();
    expect(entitiesService.attachEntityToIncident).toBeDefined();
  });

  it('uses apiClient from lib', async () => {
    const source = await import('./entities.service?raw');
    expect(source.default).toContain("from '@/lib/apiClient'");
  });

  it('uses type-only imports for types', async () => {
    const source = await import('./entities.service?raw');
    expect(source.default).toContain('import type');
  });
});
