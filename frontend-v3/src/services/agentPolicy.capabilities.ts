/**
 * Agent policy capability gates (POL-001 / POL-003 / STAGING CANDIDATE).
 *
 * Host enforcement is never claimed complete. UI surfaces assignment + any
 * agent-reported AgentPolicyStateDTO fields with explicit unavailable/partial.
 * Apply/ack requires appliedVersion or lastAppliedAt — never green “enforced on host”.
 */

import type {
  AgentPolicyEnforcementEvidenceDTO,
  AgentPolicyStateDTO,
} from '@/types/edr';

/** Flip remains false until a live-verified agent apply/ack (gRPC) path exists. */
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

/** Page banner — assignment ≠ host enforcement proof (POL-001 / POL-003). */
export const AGENT_POLICY_HONESTY_BANNER =
  'Assignment is configuration only. Apply/ack path unavailable until agent-reported ' +
  'appliedVersion or lastAppliedAt exists — STAGING CANDIDATE (unavailable or partial). ' +
  'Never treat assigned agents as enforced on host.';

/** Header job sentence — configuration / assignment workbench. */
export const AGENT_POLICY_JOB_SENTENCE =
  'Define and assign agent monitoring policies (config only — Ha plane). Enforcement evidence is ' +
  'partial or unavailable when apply/ack fields are missing — not live host proof. ' +
  'Schema v1 FIM push lives under Sensors → Agent FIM policies; Endpoints for host timelines.';

/** True only when a state row carries appliedVersion or lastAppliedAt (POL-003). */
export function hasAgentPolicyApplyAckEvidence(state: AgentPolicyStateDTO | null | undefined): boolean {
  if (!state) return false;
  return state.appliedVersion != null || state.lastAppliedAt != null;
}

/**
 * Prefer backend `applyAckPathAvailable`; fall back to scanning state rows.
 * Never implies LIVE VERIFIED host enforcement.
 */
export function isAgentPolicyApplyAckPathAvailable(
  evidence: AgentPolicyEnforcementEvidenceDTO | null | undefined,
): boolean {
  if (!evidence) return false;
  if (typeof evidence.applyAckPathAvailable === 'boolean') {
    return evidence.applyAckPathAvailable;
  }
  return (evidence.agentStates ?? []).some(hasAgentPolicyApplyAckEvidence);
}
