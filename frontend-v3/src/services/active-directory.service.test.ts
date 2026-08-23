import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { activeDirectoryFixtureMode, fetchAdPosture } from './active-directory.service';

describe('active-directory.service honesty', () => {
  it('keeps fixture mode off outside an explicit DEV foundation build', () => {
    expect(activeDirectoryFixtureMode).toBe(false);
  });

  it('returns an explicit missing contract with no invented rows', async () => {
    const page = await fetchAdPosture({
      view: 'assessments',
      risk: 'all',
      category: 'all',
      timeRange: '24h',
      limit: 50,
    });

    expect(page.contractState).toBe('missing');
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.summary.postureScore).toBeNull();
    expect(page.summary.criticalAssessments).toBeNull();
    expect(page.partialFailures[0]?.source).toBe('active-directory-posture');
    expect(page.partialFailures[0]?.message).toMatch(/not implemented/i);
  });

  it('does not invent Active Directory or attack-path API paths', () => {
    const service = readFileSync(join(process.cwd(), 'src/services/active-directory.service.ts'), 'utf8');
    expect(service).not.toMatch(/\/api\/ha-ad/);
    expect(service).not.toMatch(/\/api\/ha-active-directory/);
    expect(service).not.toMatch(/fetch\(/);
    expect(service).toContain("import.meta.env.DEV");
    expect(service).toContain("import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true'");
    expect(service).toContain("contractState: 'missing'");
  });

  it('keeps fictional directory records behind the production alias boundary', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const buildScript = readFileSync(join(process.cwd(), 'scripts/build.mjs'), 'utf8');

    expect(viteConfig).toContain('active-directory.fixture-disabled.ts');
    expect(buildScript).toContain(
      '--alias:@/pages/posture/active-directory/active-directory.fixtures=./src/pages/posture/active-directory/active-directory.fixture-disabled.ts',
    );
  });
});
