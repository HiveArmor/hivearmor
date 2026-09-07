/**
 * Capability / honesty copy for the Utm agent-policies FIM console (FE-POL-01 / FE-SEC-01 / Next).
 * Reuses Admin | SOC Manager mutate gates from the Ha policies capabilities module.
 */

import {
  AGENT_POLICY_MUTATE_DENIED_TITLE,
  AGENT_POLICY_MUTATE_ROLES,
  AGENT_POLICY_READ_DENIED_MESSAGE,
  AGENT_POLICY_READ_ROLES,
  canMutateAgentPolicies,
  canReadAgentPolicies,
} from '@/services/agentPolicy.capabilities';

export {
  AGENT_POLICY_MUTATE_DENIED_TITLE,
  AGENT_POLICY_MUTATE_ROLES,
  AGENT_POLICY_READ_DENIED_MESSAGE,
  AGENT_POLICY_READ_ROLES,
  canMutateAgentPolicies,
  canReadAgentPolicies,
};

export const AGENT_FIM_POLICY_HONESTY_BANNER =
  'STAGING CANDIDATE — author agent schema v1 (plus v1.1 telemetry schedule fields) and push ' +
  'APPLY_POLICY to agent groups or a single agent. ' +
  'Push queues commands; host apply/ack evidence may be partial or missing. ' +
  'Do not treat assigned groups as verified enforcement on host.';

export const AGENT_FIM_POLICY_JOB_SENTENCE =
  'Edit FIM include/exclude paths, telemetry SCA/SBOM intervals, and optional remote-shell gate, ' +
  'then assign and push to agent groups or a selected agent. Ha EDR policies remain a separate config plane.';

export const AGENT_FIM_POLICY_DUAL_PLANE_NOTE =
  'Ha Agent Policies (/edr/policies) edit legacy path columns without push. ' +
  'This console is the source of truth for schema v1 push to agents.';

/**
 * Shown when GET /api/agent-groups returns 403 (or list is disabled).
 * Prefer group picker for Admin | SOC Manager when the list succeeds.
 */
export const AGENT_GROUPS_LIST_FALLBACK_NOTE =
  'Agent group list unavailable for this session. ' +
  'Enter a known group id to assign/push. STAGING CANDIDATE.';

/** @deprecated Prefer AGENT_GROUPS_LIST_FALLBACK_NOTE — kept for older copy imports. */
export const AGENT_GROUPS_ADMIN_ONLY_NOTE = AGENT_GROUPS_LIST_FALLBACK_NOTE;

/**
 * Honesty: enroll → policy sync-on-connect exists on agent/BE (STAGING) but is not LIVE VERIFIED.
 */
export const AGENT_POLICY_PUSH_ON_CONNECT_NOTE =
  'STAGING CANDIDATE — push-on-connect / sync-on-connect may run after AgentStream; enroll policy_id is still ' +
  'primarily an audit label until LIVE VERIFIED. Prefer explicit group or per-agent push when certainty matters.';

export const ALLOW_SHELL_MUTATE_HINT =
  'Enables unstructured remote shell on agents that apply this policy. Default off.';

export const TELEMETRY_SCHEDULE_HINT =
  'Schema v1.1 fields (`telemetry.sca_interval_hours` / `sbom_interval_hours`). ' +
  'Leave blank to omit (agent default 6 hours; agent clamps 1–168). ' +
  'STAGING CANDIDATE — host scheduling applies after APPLY_POLICY; not LIVE VERIFIED fleet-wide.';

export const PER_AGENT_PUSH_HINT =
  'Per-agent push calls POST /api/agent-policies/{id}/push-agent/{agentId} (202 Accepted). ' +
  'STAGING CANDIDATE — queues APPLY_POLICY; host apply/ack may be partial.';

/** Roles that may attempt GET /api/agent-groups (graceful 403 fallback). */
export const AGENT_GROUPS_LIST_ROLES = ['ROLE_ADMIN', 'ROLE_SOC_MANAGER'] as const;

export function canListAgentGroups(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false;
  return AGENT_GROUPS_LIST_ROLES.some((role) => roles.includes(role));
}
