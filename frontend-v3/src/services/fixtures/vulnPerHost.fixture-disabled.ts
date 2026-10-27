import type { VulnFindingDTO } from '@/types/vuln.types';

/**
 * Production build alias target. Fictional per-host vuln data must never ship in prod
 * bundles — aliased in via vite.config when VITE_USE_FOUNDATION_FIXTURES !== 'true'.
 */
export function foundationVulnFindingsByAgent(): { findings: VulnFindingDTO[]; total: number } {
  throw new Error('Per-host vuln foundation fixtures are excluded from production builds.');
}
