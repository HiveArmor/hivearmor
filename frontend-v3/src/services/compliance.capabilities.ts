/**
 * CMP-013 — compliance governance mutation capability gates.
 */

export const CMP_GOVERNANCE_MUTATE_ROLES = ['ROLE_ADMIN', 'ROLE_SOC_MANAGER'] as const;

export function canMutateComplianceGovernance(
  roles: readonly string[] | undefined | null,
): boolean {
  if (!roles || roles.length === 0) return false;
  return CMP_GOVERNANCE_MUTATE_ROLES.some((role) => roles.includes(role));
}

export const CMP_GOVERNANCE_MUTATE_DENIED_TITLE =
  'Required permission: Platform Administrator or SOC Manager';
