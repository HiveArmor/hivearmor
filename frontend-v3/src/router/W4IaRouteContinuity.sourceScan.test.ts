import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LEGACY_ROUTE_REGISTRY,
  matchLegacyRoute,
} from '@/lib/deprecation.honesty';

/**
 * W4 IA route continuity (SPEC-05).
 *
 * The Endpoint Security consolidation MUST NOT 404 any bookmarked route. Every
 * moved path stays mounted in place with a LegacyRouteNotice banner (driven by
 * LEGACY_ROUTE_REGISTRY + AppLayout's matchLegacyRoute), and the new canonical
 * routes are registered. This scans the router source and the registry rather
 * than rendering the lazy router tree.
 */
describe('W4 IA route continuity (SPEC-05)', () => {
  const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
  const nav = readFileSync(
    join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'),
    'utf8',
  );

  it('registers the canonical Endpoint Security routes', () => {
    expect(router).toContain("path: 'endpoints'");
    expect(router).toContain("path: 'endpoints/fim-policies'");
    // Canonical fleet renders the full-featured SensorGridPage.
    expect(router).toMatch(/path: 'endpoints',[\s\S]*?<SensorGridPage \/>/);
    expect(router).toMatch(/path: 'endpoints\/fim-policies',[\s\S]*?<AgentFimPolicyPage \/>/);
  });

  it('keeps every moved route mounted in place (no 404 for bookmarks)', () => {
    // Legacy fleet + FIM paths still have router entries.
    expect(router).toContain("path: 'posture/sensors'");
    expect(router).toContain("path: 'posture/sensors/fim-policies'");
    expect(router).toContain("path: 'edr/endpoints'");
    // The W3 per-agent detail param route is untouched.
    expect(router).toContain("path: 'edr/endpoints/:agentId'");
  });

  it('LEGACY_ROUTE_REGISTRY covers each moved path with an honest banner', () => {
    const moved: Array<[string, string]> = [
      ['/posture/sensors', '/endpoints'],
      ['/edr/endpoints', '/endpoints'],
      ['/posture/sensors/fim-policies', '/endpoints/fim-policies'],
    ];
    for (const [legacy, canonical] of moved) {
      const entry = matchLegacyRoute(legacy);
      expect(entry, `registry entry for ${legacy}`).toBeDefined();
      expect(entry?.canonicalPath).toBe(canonical);
      expect(entry?.stillLinked).toBe(true);
      expect((entry?.bannerDetail.length ?? 0) > 0).toBe(true);
    }
  });

  it('makes no fake migration / deprecation-header claims (Wave-D honesty)', () => {
    const lib = readFileSync(join(process.cwd(), 'src/lib/deprecation.honesty.ts'), 'utf8');
    expect(lib).not.toMatch(/fully migrated/i);
    expect(lib).not.toMatch(/Deprecation:\s*true/i);
    // Every W4 moved-path entry keeps the "not advertised yet (GOV-008)" honesty.
    expect(LEGACY_ROUTE_REGISTRY.filter((e) => e.canonicalPath.startsWith('/endpoints'))).toHaveLength(3);
  });

  it('nav: single ENDPOINT SECURITY section replaces ENDPOINT DEFENSE and pulls fleet out of POSTURE', () => {
    expect(nav).toContain('title="ENDPOINT SECURITY"');
    expect(nav).not.toContain('title="ENDPOINT DEFENSE"');
    // Fleet + FIM policies removed from POSTURE_ITEMS (no /posture/sensors nav entry).
    expect(nav).not.toMatch(/route: '\/posture\/sensors'/);
    expect(nav).not.toMatch(/route: '\/posture\/sensors\/fim-policies'/);
    // Endpoints nav entry points at the canonical /endpoints.
    expect(nav).toMatch(/label: 'Endpoints',[^\n]*route: '\/endpoints'/);
    // filterItemsByRole is preserved.
    expect(nav).toContain('filterItemsByRole');
  });
});
