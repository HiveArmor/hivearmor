import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getFoundationResponseGovernance,
  saveFoundationResponseAuthorityDelegate,
  saveFoundationResponseAuthorityPolicy,
} from './response.fixtures';

const editorSource = readFileSync(join(__dirname, 'ResponseAuthorityEditorPage.tsx'), 'utf8');
const authoritySource = readFileSync(join(__dirname, 'ResponseAuthorityPage.tsx'), 'utf8');
const densitySource = readFileSync(join(__dirname, 'response-grid-standard.ts'), 'utf8');

describe('Response governance editor routes and safety', () => {
  it('exposes policy and delegation editing from the policy workspace', () => {
    expect(authoritySource).toContain('/response/authority/policies/new');
    expect(authoritySource).toContain('/response/authority/delegations/new');
    expect(authoritySource).toContain('/response/authority/policies/${policy.id}/edit');
    expect(authoritySource).toContain('/response/authority/delegations/${delegate.id}/edit');
  });

  it('requires an audit rationale and optimistic version', () => {
    expect(editorSource).toContain('minimum 12 characters');
    expect(editorSource).toContain('expectedVersion');
    expect(editorSource).toContain('Optimistic version check prevents stale overwrite');
  });

  it('keeps draft and authoritative publish actions distinct', () => {
    expect(editorSource).toContain('Save draft');
    expect(editorSource).toContain('Validate & publish');
    expect(editorSource).toContain('backend remains authoritative');
  });

  it('enforces the shared two-line Response row heights', () => {
    expect(densitySource).toContain('compact: 36');
    expect(densitySource).toContain('standard: 42');
    expect(densitySource).toContain('comfortable: 48');
  });
});

describe('Response governance fixture mutations', () => {
  it('creates and versions a policy without changing existing policy identities', () => {
    const before = getFoundationResponseGovernance({}).policies.map((item) => item.id);
    const saved = saveFoundationResponseAuthorityPolicy({
      name: 'Fixture case containment', actionCategory: 'CASE', riskFloor: 'HIGH',
      tenantScope: 'All authorized tenants', requiredApprovals: 1,
      approverGroups: ['SOC Managers'], selfApprovalAllowed: false,
      changeWindow: 'Any time', rollbackRequired: true, status: 'ENFORCED',
      changeReason: 'Exercise governed policy creation.', publish: true,
    });
    expect(saved.version).toBe(1);
    expect(saved.status).toBe('ENFORCED');
    expect(getFoundationResponseGovernance({}).policies.map((item) => item.id)).toEqual(expect.arrayContaining(before));
  });

  it('rejects a stale policy overwrite', () => {
    const current = getFoundationResponseGovernance({}).policies[0];
    expect(() => saveFoundationResponseAuthorityPolicy({
      id: current.id, expectedVersion: current.version - 1, name: current.name,
      actionCategory: current.actionCategory, riskFloor: current.riskFloor,
      tenantScope: current.tenantScope, requiredApprovals: current.requiredApprovals,
      approverGroups: current.approverGroups, selfApprovalAllowed: current.selfApprovalAllowed,
      changeWindow: current.changeWindow, rollbackRequired: current.rollbackRequired,
      status: current.status, changeReason: 'Attempt a stale policy update.', publish: true,
    })).toThrow(/changed after you opened/i);
  });

  it('creates a time-bounded emergency delegation with a version', () => {
    const validFrom = new Date().toISOString();
    const validUntil = new Date(Date.now() + 60 * 60_000).toISOString();
    const saved = saveFoundationResponseAuthorityDelegate({
      principal: 'Fixture Incident Commander', principalType: 'USER', authorityTier: 3,
      actionScopes: ['Endpoint'], tenantScope: 'All authorized tenants', validFrom,
      validUntil, emergencyAccess: true, status: 'ACTIVE',
      changeReason: 'Exercise emergency delegated authority.', publish: true,
    });
    expect(saved.version).toBe(1);
    expect(saved.emergencyAccess).toBe(true);
    expect(new Date(saved.validUntil).getTime()).toBeGreaterThan(new Date(saved.validFrom).getTime());
  });
});
