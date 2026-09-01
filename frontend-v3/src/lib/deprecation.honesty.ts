/**
 * Wave D Prompt 52 — legacy route and UI-generation honesty (STAGING CANDIDATE).
 *
 * Do not claim routes or APIs are "migrated", deprecated with standard headers,
 * or production-ready until lifecycle evidence exists (GOV-008–GOV-010).
 */

export type LegacyRouteKind = 'path-alias' | 'redirect-only' | 'admin-tooling';

export interface LegacyRouteEntry {
  path: string;
  kind: LegacyRouteKind;
  canonicalPath: string;
  chipLabel: string;
  bannerTitle: string;
  bannerDetail: string;
  /** UI still links here (bookmarks/deep links may also land). */
  stillLinked?: boolean;
}

/** Mounted or linked legacy paths — honest copy only, no fake migration claims. */
export const LEGACY_ROUTE_REGISTRY: readonly LegacyRouteEntry[] = [
  {
    path: '/settings/system',
    kind: 'path-alias',
    canonicalPath: '/admin/settings',
    chipLabel: 'Legacy path',
    bannerTitle: 'Legacy settings bookmark',
    bannerDetail:
      'This URL remains for bookmarks and deep links. Canonical platform settings live at /admin/settings. Backend Deprecation, Sunset, and successor Link headers are not advertised yet (GOV-008).',
    stillLinked: true,
  },
  {
    path: '/admin/rules/test',
    kind: 'admin-tooling',
    canonicalPath: '/detection-rules',
    chipLabel: 'Admin tooling',
    bannerTitle: 'Legacy admin rule test path',
    bannerDetail:
      'Canonical rule testing is under Detection Rules (/detection-rules/{id}/test). This admin URL remains for editor hand-off only — not a separate governed surface.',
    stillLinked: true,
  },
  {
    path: '/admin/rules/import',
    kind: 'admin-tooling',
    canonicalPath: '/detection-rules',
    chipLabel: 'Admin tooling',
    bannerTitle: 'Legacy admin rule import path',
    bannerDetail:
      'Canonical detection rule authoring is under Detection Rules. This import URL is not marked deprecated until lifecycle headers and consumer cutover are recorded.',
    stillLinked: false,
  },
] as const;

/** Redirect-only aliases — Navigate in router; listed for honesty scans, not page banners. */
export const LEGACY_REDIRECT_ALIASES = [
  { path: '/offenses', canonicalPath: '/correlated-findings' },
  { path: '/rules', canonicalPath: '/detection-rules' },
  { path: '/response/playbooks-legacy', canonicalPath: '/response/playbooks' },
  { path: '/admin/tenants-old', canonicalPath: '/admin/tenants' },
  { path: '/admin/audit-old', canonicalPath: '/admin/audit' },
  { path: '/admin/settings-old', canonicalPath: '/admin/settings' },
  { path: '/admin/connection-keys', canonicalPath: '/settings/api-keys' },
] as const;

export const FRONTEND_V3_BOUNDARY = {
  chipLabel: 'UI v3',
  title: 'HiveArmor operator UI generation',
  detail:
    'This session runs frontend-v3 (STAGING CANDIDATE). Legacy frontend-v2 packaging may still appear in older deployment profiles — it is not the governed Autonomous SOC surface and is not marked production-ready here.',
} as const;

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
}

export function matchLegacyRoute(pathname: string): LegacyRouteEntry | undefined {
  const normalized = normalizePathname(pathname);
  return LEGACY_ROUTE_REGISTRY.find((entry) => entry.path === normalized);
}

export function getLegacyRouteLinkEntry(path: string): LegacyRouteEntry | undefined {
  const normalized = normalizePathname(path);
  const entry = LEGACY_ROUTE_REGISTRY.find((item) => item.path === normalized);
  return entry?.stillLinked ? entry : undefined;
}
