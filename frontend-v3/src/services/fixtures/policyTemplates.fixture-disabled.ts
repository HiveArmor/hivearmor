import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';

/**
 * Production build alias target. Fictional policy-template data must never ship in
 * prod bundles — this throwing stub is aliased in via vite.config when
 * VITE_USE_FOUNDATION_FIXTURES !== 'true'.
 */
export const foundationPolicyTemplates: UtmAgentPolicyDTO[] = [];

export function filterFoundationPolicyTemplates(): UtmAgentPolicyDTO[] {
  throw new Error('Policy-template foundation fixtures are excluded from production builds.');
}
