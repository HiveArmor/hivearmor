/**
 * Vitest — Utm agent-policies push console capabilities (FE-POL Next).
 */

import { describe, expect, it } from 'vitest';

import {
  AGENT_FIM_POLICY_HONESTY_BANNER,
  AGENT_GROUPS_LIST_FALLBACK_NOTE,
  AGENT_POLICY_PUSH_ON_CONNECT_NOTE,
  canListAgentGroups,
  PER_AGENT_PUSH_HINT,
  TELEMETRY_SCHEDULE_HINT,
} from './agentPoliciesPush.capabilities';

describe('agentPoliciesPush.capabilities', () => {
  it('keeps STAGING CANDIDATE honesty for push and enroll sync', () => {
    expect(AGENT_FIM_POLICY_HONESTY_BANNER).toMatch(/STAGING CANDIDATE/i);
    expect(AGENT_POLICY_PUSH_ON_CONNECT_NOTE).toMatch(/STAGING CANDIDATE/i);
    expect(AGENT_POLICY_PUSH_ON_CONNECT_NOTE).toMatch(/push-on-connect/i);
    expect(AGENT_POLICY_PUSH_ON_CONNECT_NOTE).not.toMatch(/LIVE VERIFIED host/i);
    expect(PER_AGENT_PUSH_HINT).toMatch(/push-agent/);
    expect(TELEMETRY_SCHEDULE_HINT).toMatch(/sca_interval_hours/);
    expect(AGENT_GROUPS_LIST_FALLBACK_NOTE).toMatch(/STAGING CANDIDATE/i);
  });

  it('allows Admin and SOC Manager to attempt agent-groups list', () => {
    expect(canListAgentGroups(['ROLE_ADMIN'])).toBe(true);
    expect(canListAgentGroups(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canListAgentGroups(['ROLE_ANALYST'])).toBe(false);
    expect(canListAgentGroups([])).toBe(false);
  });
});
