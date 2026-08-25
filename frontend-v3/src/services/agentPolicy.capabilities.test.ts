/**
 * Vitest — agent policy capability honesty (POL-001 / POL-003).
 */
import { describe, expect, it } from 'vitest';

import {
  AGENT_POLICY_HOST_ENFORCEMENT_VERIFIED,
  AGENT_POLICY_HONESTY_BANNER,
  AGENT_POLICY_MUTATE_DENIED_TITLE,
  AGENT_POLICY_READ_DENIED_MESSAGE,
  canMutateAgentPolicies,
  canReadAgentPolicies,
  hasAgentPolicyApplyAckEvidence,
  isAgentPolicyApplyAckPathAvailable,
} from './agentPolicy.capabilities';

import type { AgentPolicyEnforcementEvidenceDTO } from '@/types/edr';

describe('agentPolicy.capabilities', () => {
  it('keeps host enforcement unverified (STAGING CANDIDATE)', () => {
    expect(AGENT_POLICY_HOST_ENFORCEMENT_VERIFIED).toBe(false);
    expect(AGENT_POLICY_HONESTY_BANNER).toMatch(/STAGING CANDIDATE/i);
    expect(AGENT_POLICY_HONESTY_BANNER).toMatch(/unavailable or partial/i);
    expect(AGENT_POLICY_HONESTY_BANNER).toMatch(/apply\/ack path unavailable/i);
    expect(AGENT_POLICY_HONESTY_BANNER).toMatch(/never treat .* enforced on host/i);
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

  it('treats missing appliedVersion/lastAppliedAt as apply/ack unavailable (POL-003)', () => {
    expect(
      hasAgentPolicyApplyAckEvidence({
        agentId: 'a1',
        state: 'PENDING',
        desiredVersion: 2,
      }),
    ).toBe(false);

    expect(
      hasAgentPolicyApplyAckEvidence({
        agentId: 'a1',
        appliedVersion: 1,
      }),
    ).toBe(true);

    expect(
      hasAgentPolicyApplyAckEvidence({
        agentId: 'a1',
        lastAppliedAt: '2026-08-25T05:00:00Z',
      }),
    ).toBe(true);

    const withoutAck: AgentPolicyEnforcementEvidenceDTO = {
      policyId: 1,
      assignedAgentIds: ['a1'],
      evidenceAvailability: 'unavailable',
      honestyNote: 'Apply/ack path unavailable',
      applyAckPathAvailable: false,
      agentStates: [{ agentId: 'a1', state: 'PENDING' }],
    };
    expect(isAgentPolicyApplyAckPathAvailable(withoutAck)).toBe(false);

    const withAck: AgentPolicyEnforcementEvidenceDTO = {
      ...withoutAck,
      evidenceAvailability: 'partial',
      applyAckPathAvailable: true,
      agentStates: [{ agentId: 'a1', appliedVersion: 3 }],
    };
    expect(isAgentPolicyApplyAckPathAvailable(withAck)).toBe(true);
  });
});
