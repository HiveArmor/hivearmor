import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FRONTEND_V3_BOUNDARY,
  LEGACY_REDIRECT_ALIASES,
  LEGACY_ROUTE_REGISTRY,
  getLegacyRouteLinkEntry,
  matchLegacyRoute,
} from '@/lib/deprecation.honesty';

describe('Wave D deprecation honesty (Prompt 52)', () => {
  it('D-20: legacy registry covers still-linked paths without migration claims', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/deprecation.honesty.ts'), 'utf8');
    expect(source).toContain('/settings/system');
    expect(source).toContain('/admin/rules/test');
    expect(source).toContain('not marked deprecated');
    expect(source).not.toMatch(/fully migrated/i);
    expect(source).not.toMatch(/Deprecation:\s*true/i);
    expect(getLegacyRouteLinkEntry('/settings/system')?.chipLabel).toBe('Legacy path');
    expect(matchLegacyRoute('/admin/rules/test')?.canonicalPath).toBe('/detection-rules');
  });

  it('D-21: AppLayout renders legacy route notice from pathname', () => {
    const layout = readFileSync(join(process.cwd(), 'src/router/AppLayout.tsx'), 'utf8');
    expect(layout).toContain('matchLegacyRoute');
    expect(layout).toContain('<LegacyRouteNotice entry={legacyRoute} />');
  });

  it('D-22: AdminSettings system link carries legacy chip', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/pages/admin/settings/AdminSettingsPage.tsx'),
      'utf8',
    );
    expect(page).toContain('LegacyRouteLinkChip');
    expect(page).toContain("getLegacyRouteLinkEntry('/settings/system')");
  });

  it('D-23: masthead exposes frontend-v3 boundary chip', () => {
    const masthead = readFileSync(
      join(process.cwd(), 'src/components/ha-masthead/HaMasthead.tsx'),
      'utf8',
    );
    expect(masthead).toContain('FRONTEND_V3_BOUNDARY');
    expect(masthead).toContain('data-testid="frontend-v3-boundary-chip"');
    expect(FRONTEND_V3_BOUNDARY.detail).toContain('frontend-v3');
    expect(FRONTEND_V3_BOUNDARY.detail).toContain('frontend-v2');
    expect(FRONTEND_V3_BOUNDARY.detail).toContain('not marked production-ready');
  });

  it('D-24: redirect aliases stay Navigate-only (no dual live legacy mounts)', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    expect(router).toContain("path: 'response/playbooks-legacy'");
    expect(router).toContain('Navigate to="/correlated-findings"');
    expect(router).toContain('Navigate to="/settings/api-keys"');
    expect(LEGACY_REDIRECT_ALIASES.some((alias) => alias.path === '/admin/connection-keys')).toBe(
      true,
    );
    expect(LEGACY_ROUTE_REGISTRY.every((entry) => entry.bannerDetail.length > 0)).toBe(true);
  });
});
