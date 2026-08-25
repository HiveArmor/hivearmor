/**
 * Vitest — agent policy capability honesty (POL-001).
 */
import { describe, expect, it } from 'vitest';

import {
  AGENT_POLICY_HOST_ENFORCEMENT_VERIFIED,
  AGENT_POLICY_HONESTY_BANNER,
  AGENT_POLICY_MUTATE_DENIED_TITLE,
  AGENT_POLICY_READ_DENIED_MESSAGE,
  canMutateAgentPolicies,
  canReadAgentPolicies,
} from './agentPolicy.capabilities';

describe('agentPolicy.capabilities', () => {
  it('keeps host enforcement unverified (STAGING CANDIDATE)', () => {
    expect(AGENT_POLICY_HOST_ENFORCEMENT_VERIFIED).toBe(false);
    expect(AGENT_POLICY_HONESTY_BANNER).toMatch(/STAGING CANDIDATE/i);
    expect(AGENT_POLICY_HONESTY_BANNER).toMatch(/unavailable or partial/i);
  });

  it('allows Analyst read and withholds Analyst mutate', () => {
    expect(canReadAgentPolicies(['ROLE_ANALYST'])).toBe(true);
    expect(canMutateAgentPolicies(['ROLE_ANALYST'])).toBe(false);
    expect(canMutateAgentPolicies(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canMutateAgentPolicies(['ROLE_ADMIN'])).toBe(true);
  });

  it('uses human role labels in access copy', () => {
    expect(AGENT_POLICY_READ_DENIED_MESSAGE).not.toMatch(/ROLE_/);
    expect(AGENT_POLICY_MUTATE_DENIED_TITLE).not.toMatch(/ROLE_/);
    expect(AGENT_POLICY_READ_DENIED_MESSAGE).toMatch(/Platform Administrator/);
  });
});
