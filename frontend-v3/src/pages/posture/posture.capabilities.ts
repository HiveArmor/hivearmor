/**
 * Posture / compliance capability gates (Wave B2 — STAGING CANDIDATE honesty).
 */

/** Vuln remediation execute exists only to throw VUL_REMEDIATION_UNAVAILABLE — never expose Execute CTA. */
export const VULN_REMEDIATION_EXECUTE_AVAILABLE = false;

/** CIS action preview/mutate endpoints throw CIS_MUTATION_UNAVAILABLE — keep UI governance-only. */
export const CIS_MUTATION_AVAILABLE = false;

export const VULN_REMEDIATION_EXECUTE_DISABLED_TITLE =
  'Remediation execute is not available from the vulnerability API';

export const CIS_MUTATION_DISABLED_TITLE =
  'CIS benchmark mutations are not available from the backend';
