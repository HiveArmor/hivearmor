import { describe, expect, it } from 'vitest';

import {
  FRONTEND_V3_BOUNDARY,
  getLegacyRouteLinkEntry,
  matchLegacyRoute,
  normalizePathname,
} from '@/lib/deprecation.honesty';

describe('deprecation.honesty', () => {
  it('matches mounted legacy paths', () => {
    expect(matchLegacyRoute('/settings/system')?.kind).toBe('path-alias');
    expect(matchLegacyRoute('/admin/rules/test')?.kind).toBe('admin-tooling');
    expect(matchLegacyRoute('/detection-rules')).toBeUndefined();
  });

  it('normalizes trailing slashes', () => {
    expect(normalizePathname('/settings/system/')).toBe('/settings/system');
    expect(matchLegacyRoute('/settings/system/')).toBeDefined();
  });

  it('returns link entries only for still-linked paths', () => {
    expect(getLegacyRouteLinkEntry('/settings/system')?.chipLabel).toBe('Legacy path');
    expect(getLegacyRouteLinkEntry('/admin/rules/import')).toBeUndefined();
  });

  it('frontend-v3 boundary copy stays STAGING CANDIDATE honest', () => {
    expect(FRONTEND_V3_BOUNDARY.detail).toContain('STAGING CANDIDATE');
    expect(FRONTEND_V3_BOUNDARY.detail).not.toMatch(/fully migrated/i);
  });
});
