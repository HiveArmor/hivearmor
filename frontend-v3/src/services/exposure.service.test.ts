import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exposureFixtureMode, fetchExposure } from './exposure.service';

describe('exposure.service honesty', () => {
  it('keeps fixture mode off outside an explicit DEV foundation build', () => {
    expect(exposureFixtureMode).toBe(false);
  });

  it('returns an explicit missing contract with no invented attack paths', async () => {
    const page = await fetchExposure({
      view: 'attack_paths',
      risk: 'all',
      scope: 'all',
      state: 'active',
      timeRange: '24h',
      limit: 50,
    });

    expect(page.contractState).toBe('missing');
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.summary.exposureScore).toBeNull();
    expect(page.summary.activeAttackPaths).toBeNull();
    expect(page.freshness).toBe('unknown');
    expect(page.partialFailures[0]?.source).toBe('exposure-graph');
    expect(page.partialFailures[0]?.message).toMatch(/not implemented/i);
  });

  it('does not invent exposure or attack-path API paths', () => {
    const service = readFileSync(join(process.cwd(), 'src/services/exposure.service.ts'), 'utf8');
    expect(service).not.toMatch(/\/api\/ha-exposure/);
    expect(service).not.toMatch(/\/api\/ha-attack-path/);
    expect(service).not.toMatch(/\/api\/ha-graph\/attack/);
    expect(service).not.toMatch(/fetch\(/);
    expect(service).toContain("import.meta.env.DEV");
    expect(service).toContain("import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true'");
    expect(service).toContain("contractState: 'missing'");
  });

  it('keeps fictional exposure records behind the production alias boundary', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const buildScript = readFileSync(join(process.cwd(), 'scripts/build.mjs'), 'utf8');

    expect(viteConfig).toContain('exposure.fixture-disabled.ts');
    expect(buildScript).toContain(
      '--alias:@/pages/posture/exposure/exposure.fixtures=./src/pages/posture/exposure/exposure.fixture-disabled.ts',
    );
  });
});
