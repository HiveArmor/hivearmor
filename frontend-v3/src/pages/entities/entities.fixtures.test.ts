import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  foundationEntities, getFoundationEntities, getFoundationEntityAlerts, getFoundationEntityDetail,
  getFoundationEntityEvents,
} from './entities.fixtures';

describe('entity inventory fixtures', () => {
  it('keeps entity IDs unique and cursor pages bounded without overlap', async () => {
    const first = await getFoundationEntities({ activityWindow: '90d', cursor: null, limit: 100 });
    const second = await getFoundationEntities({ activityWindow: '90d', cursor: first.nextCursor, limit: 100 });

    expect(new Set(foundationEntities.map((entity) => entity.id)).size).toBe(foundationEntities.length);
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toBe('entity-fixture-100');
    expect(second.items).toHaveLength(100);
    expect(new Set([...first.items, ...second.items].map((entity) => entity.id)).size).toBe(200);
  });

  it('applies entity, risk, activity, tenant, and text filters before pagination', async () => {
    const result = await getFoundationEntities({
      type: 'host',
      riskLevels: ['critical'],
      activityWindow: '90d',
      tenantScope: 'northstar',
      search: 'FIN-WKS',
      limit: 100,
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((entity) => entity.entityType === 'host')).toBe(true);
    expect(result.items.every((entity) => entity.riskScore >= 80)).toBe(true);
    expect(result.items.every((entity) => entity.tenantId === 'northstar')).toBe(true);
    expect(result.items.every((entity) => entity.name?.includes('FIN-WKS'))).toBe(true);
    expect(result.summary?.totalApproximate).toBe(result.items.length);
  });

  it('keeps fixture records behind the production alias boundary', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const buildScript = readFileSync(join(process.cwd(), 'scripts/build.mjs'), 'utf8');
    expect(viteConfig).toContain('entities.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/entities/entities.fixtures=./src/pages/entities/entities.fixture-disabled.ts');
  });

  it('keeps dossier identity, risk explanations, relationships, and activity internally consistent', () => {
    const entity = foundationEntities[0];
    const detail = getFoundationEntityDetail(entity.id);
    const alerts = getFoundationEntityAlerts(entity.id);
    const events = getFoundationEntityEvents(entity.id);

    expect(detail.id).toBe(entity.id);
    expect(detail.riskScore).toBe(entity.riskScore);
    expect(detail.riskDrivers?.length).toBeGreaterThan(0);
    expect(detail.baselineMetrics?.length).toBeGreaterThan(0);
    expect(detail.relatedEntities?.length).toBeGreaterThan(0);
    expect(detail.riskTimeline).toHaveLength(30);
    expect(alerts.length).toBeLessThanOrEqual(50);
    expect(events).toHaveLength(160);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });
});
