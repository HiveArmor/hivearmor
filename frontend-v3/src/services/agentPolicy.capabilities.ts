/**
 * Agent policy capability gates (POL-001 / STAGING CANDIDATE).
 *
 * Host enforcement is never claimed complete. UI surfaces assignment + any
 * agent-reported AgentPolicyStateDTO fields with explicit unavailable/partial.
 */

/** Flip remains false until a live-verified agent apply/ack path exists. */
export const AGENT_POLICY_HOST_ENFORCEMENT_VERIFIED = false;

/** Roles that may read policy assignment and enforcement evidence. */
export const AGENT_POLICY_READ_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
  'ROLE_ANALYST',
] as const;

/** Roles that may create/update/delete/assign policies. */
export const AGENT_POLICY_MUTATE_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
] as const;

export function canReadAgentPolicies(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false;
  return AGENT_POLICY_READ_ROLES.some((role) => roles.includes(role));
}

export function canMutateAgentPolicies(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false;
  return AGENT_POLICY_MUTATE_ROLES.some((role) => roles.includes(role));
}

export const AGENT_POLICY_READ_DENIED_MESSAGE =
  'Required permission: Platform Administrator, SOC Manager, or Analyst';

export const AGENT_POLICY_MUTATE_DENIED_TITLE =
  'Required permission: Platform Administrator or SOC Manager';

export const AGENT_POLICY_HONESTY_BANNER =
  'Assignment is configuration only. Host policy enforcement is STAGING CANDIDATE — ' +
  'unavailable or partial until agent-reported applied version and state exist. ' +
  'Do not treat assigned agents as enforced on the host.';
