/**
 * Capability / honesty copy for the Utm agent-policies FIM console (FE-POL-01 / FE-SEC-01).
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
  'STAGING CANDIDATE — author agent schema v1 and push APPLY_POLICY to agent groups. ' +
  'Push queues commands; host apply/ack evidence may be partial or missing. ' +
  'Do not treat assigned groups as verified enforcement on host.';

export const AGENT_FIM_POLICY_JOB_SENTENCE =
  'Edit FIM include/exclude paths and optional remote-shell gate as schema v1, ' +
  'then assign and push to agent groups. Ha EDR policies remain a separate config plane.';

export const AGENT_FIM_POLICY_DUAL_PLANE_NOTE =
  'Ha Agent Policies (/edr/policies) edit legacy path columns without push. ' +
  'This console is the source of truth for schema v1 push to agents.';

export const AGENT_GROUPS_ADMIN_ONLY_NOTE =
  'Agent group list requires Platform Administrator today. ' +
  'SOC Managers can still assign/push with a known group id.';

export const ALLOW_SHELL_MUTATE_HINT =
  'Enables unstructured remote shell on agents that apply this policy. Default off.';
