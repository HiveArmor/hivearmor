/**
 * CMP-013 — compliance governance mutation capability gates.
 * CMP-014 — report snapshot and schedule mutation gates (same auth tier).
 */

export const CMP_GOVERNANCE_MUTATE_ROLES = ['ROLE_ADMIN', 'ROLE_SOC_MANAGER'] as const;

export function canMutateComplianceGovernance(
  roles: readonly string[] | undefined | null,
): boolean {
  if (!roles || roles.length === 0) return false;
  return CMP_GOVERNANCE_MUTATE_ROLES.some((role) => roles.includes(role));
}

/** CMP-014 — report snapshot and schedule writes share governance mutate tier. */
export const canMutateComplianceReports = canMutateComplianceGovernance;

export const CMP_GOVERNANCE_MUTATE_DENIED_TITLE =
  'Required permission: Platform Administrator or SOC Manager';

export const CMP_REPORT_MUTATE_DENIED_TITLE = CMP_GOVERNANCE_MUTATE_DENIED_TITLE;
