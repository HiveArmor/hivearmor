/**
 * Vitest — Utm agent-policies API service path mapping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as Promise<unknown>,
    post: (...args: unknown[]) => post(...args) as Promise<unknown>,
    put: (...args: unknown[]) => put(...args) as Promise<unknown>,
    delete: (...args: unknown[]) => del(...args) as Promise<unknown>,
  },
}));

import {
  assignPolicyGroup,
  createUtmAgentPolicy,
  deleteUtmAgentPolicy,
  getPolicyPushLog,
  getPolicyStates,
  getUtmAgentPolicy,
  listAgentGroups,
  listUtmAgentPolicies,
  pushPolicyToGroup,
  unassignPolicyGroup,
  updateUtmAgentPolicy,
} from '@/services/agentPoliciesApi.service';

describe('agentPoliciesApi.service', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    del.mockReset();
  });

  it('lists policies at /agent-policies', async () => {
    get.mockResolvedValue([]);
    await listUtmAgentPolicies();
    expect(get).toHaveBeenCalledWith('/agent-policies');
  });

  it('gets / updates / deletes by id', async () => {
    get.mockResolvedValue({ policyName: 'p' });
    put.mockResolvedValue({ policyName: 'p' });
    del.mockResolvedValue(undefined);
    await getUtmAgentPolicy(7);
    await updateUtmAgentPolicy(7, { policyName: 'p', policyConfig: '{}' });
    await deleteUtmAgentPolicy(7);
    expect(get).toHaveBeenCalledWith('/agent-policies/7');
    expect(put).toHaveBeenCalledWith('/agent-policies/7', {
      policyName: 'p',
      policyConfig: '{}',
    });
    expect(del).toHaveBeenCalledWith('/agent-policies/7');
  });

  it('creates at POST /agent-policies', async () => {
    post.mockResolvedValue({ id: 1, policyName: 'n' });
    await createUtmAgentPolicy({
      policyName: 'n',
      policyConfig: '{"schema_version":1}',
    });
    expect(post).toHaveBeenCalledWith('/agent-policies', {
      policyName: 'n',
      policyConfig: '{"schema_version":1}',
    });
  });

  it('maps assign / unassign / push group paths', async () => {
    post.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
    await assignPolicyGroup(3, 9);
    await unassignPolicyGroup(3, 9);
    await pushPolicyToGroup(3, 9);
    expect(post).toHaveBeenCalledWith('/agent-policies/3/assign-group/9');
    expect(del).toHaveBeenCalledWith('/agent-policies/3/unassign-group/9');
    expect(post).toHaveBeenCalledWith('/agent-policies/3/push/9');
  });

  it('maps push-log, states, and agent-groups', async () => {
    get.mockResolvedValue([]);
    await getPolicyPushLog(4);
    await getPolicyStates(4);
    await listAgentGroups();
    expect(get).toHaveBeenCalledWith('/agent-policies/4/push-log');
    expect(get).toHaveBeenCalledWith('/agent-policies/4/states');
    expect(get).toHaveBeenCalledWith('/agent-groups');
  });
});
