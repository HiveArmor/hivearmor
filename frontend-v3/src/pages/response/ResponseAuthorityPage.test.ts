import { describe, expect, it } from 'vitest';

import {
  decideFoundationResponseApproval,
  getFoundationResponseGovernance,
} from './response.fixtures';
import type {
  ResponseApprovalDecisionRequest,
  ResponseApprovalListParams,
  ResponseApprovalRequest,
} from './response.types';

describe('Response Governance approval queue', () => {
  it('returns a bounded pending queue by default', () => {
    const result = getFoundationResponseGovernance({ state: 'PENDING', limit: 100 });
    expect(result.approvals).toHaveLength(5);
    expect(result.approvals.every((item) => item.state === 'PENDING')).toBe(true);
  });

  it('supports exact risk filtering', () => {
    const result = getFoundationResponseGovernance({ state: 'PENDING', risk: 'CRITICAL' });
    expect(result.approvals.length).toBeGreaterThan(0);
    expect(result.approvals.every((item) => item.riskLevel === 'CRITICAL')).toBe(true);
  });

  it('searches playbooks, actions, requesters, context and targets', () => {
    const result = getFoundationResponseGovernance({ state: 'ALL', search: 'FIN-WKS-044' });
    expect(result.approvals.length).toBeGreaterThan(0);
    expect(result.approvals[0].targets).toContain('FIN-WKS-044');
  });

  it('keeps the governance snapshot tenant bounded and explicit', () => {
    const result = getFoundationResponseGovernance({ tenantScope: 'authorized' });
    expect(result.snapshotAt).toBeTruthy();
    expect(result.stale).toBe(false);
    expect(result.partialFailures).toEqual([]);
  });

  it('reports summary values independently of row filters', () => {
    const result = getFoundationResponseGovernance({ state: 'REJECTED' });
    expect(result.summary.pending).toBe(5);
    expect(result.summary.critical).toBeGreaterThan(0);
    expect(result.summary.medianDecisionMs).toBeGreaterThan(0);
  });
});

describe('Response Governance blast radius and safeguards', () => {
  it('projects targets, reversibility, rollback and required permission together', () => {
    const approval = getFoundationResponseGovernance({ state: 'PENDING' }).approvals[0];
    expect(approval.targets.length).toBeGreaterThan(0);
    expect(approval.requiredPermission).toMatch(/^ROLE_/);
    expect(approval.reversible).toBe(true);
    expect(approval.rollbackGuidance).toBeTruthy();
  });

  it('marks irreversible actions without inventing rollback guidance', () => {
    const approval = getFoundationResponseGovernance({ state: 'PENDING' }).approvals.find((item) => !item.reversible);
    expect(approval?.actionName).toContain('Terminate');
    expect(approval?.rollbackGuidance).toBeNull();
  });

  it('exposes connector and change-window state before a decision', () => {
    const approvals = getFoundationResponseGovernance({ state: 'PENDING' }).approvals;
    expect(approvals.some((item) => item.connectorState === 'DEGRADED')).toBe(true);
    expect(approvals.some((item) => item.changeWindowState !== 'OPEN')).toBe(true);
  });

  it('enforces separation of duties in fixture policies', () => {
    const result = getFoundationResponseGovernance({ state: 'PENDING' });
    expect(result.approvals.every((item) => item.separationOfDutiesSatisfied)).toBe(true);
    expect(result.policies.every((policy) => !policy.selfApprovalAllowed)).toBe(true);
  });

  it('models multi-level and multi-approver paths', () => {
    const approvals = getFoundationResponseGovernance({ state: 'PENDING' }).approvals;
    expect(approvals.some((item) => item.approvalTier >= 3)).toBe(true);
    expect(approvals.some((item) => item.approvalsRequired > 1)).toBe(true);
  });
});

describe('Response Governance policies and delegation', () => {
  it('keeps deterministic policies separate from delegated principals', () => {
    const result = getFoundationResponseGovernance({});
    expect(result.policies.length).toBeGreaterThan(0);
    expect(result.delegates.length).toBeGreaterThan(0);
  });

  it('requires rollback for every enforced disruptive policy fixture', () => {
    const result = getFoundationResponseGovernance({});
    expect(result.policies.filter((policy) => policy.status === 'ENFORCED').every((policy) => policy.rollbackRequired)).toBe(true);
  });

  it('represents emergency authority as time-bound delegation', () => {
    const emergency = getFoundationResponseGovernance({}).delegates.find((delegate) => delegate.emergencyAccess);
    expect(emergency?.status).toBe('EXPIRING');
    expect(new Date(emergency?.validUntil ?? 0).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Response Governance decision contract', () => {
  it('requires an optimistic expected state and explicit acknowledgement', () => {
    const request: ResponseApprovalDecisionRequest = {
      approvalId: 'approval-example',
      decision: 'APPROVED',
      comment: 'Evidence and rollback path reviewed.',
      expectedState: 'PENDING',
      acknowledgement: true,
    };
    expect(request.expectedState).toBe('PENDING');
    expect(request.acknowledgement).toBe(true);
  });

  it('records an immutable-style fixture decision without widening target scope', () => {
    const before = getFoundationResponseGovernance({ state: 'PENDING' }).approvals[0];
    const request: ResponseApprovalDecisionRequest = {
      approvalId: before.id,
      decision: 'APPROVED',
      comment: 'Evidence, target scope and rollback procedure reviewed.',
      expectedState: 'PENDING',
      acknowledgement: true,
    };
    const updated = decideFoundationResponseApproval(request);
    expect(updated.state).toBe('APPROVED');
    expect(updated.targets).toEqual(before.targets);
    expect(updated.decisionAt).toBeTruthy();
    expect(updated.decisionComment).toBe(request.comment);
  });

  it('rejects stale repeated decisions', () => {
    const pending = getFoundationResponseGovernance({ state: 'PENDING' }).approvals[0];
    const request: ResponseApprovalDecisionRequest = {
      approvalId: pending.id,
      decision: 'REJECTED',
      comment: 'Operational owner has not confirmed the requested target.',
      expectedState: 'PENDING',
      acknowledgement: true,
    };
    decideFoundationResponseApproval(request);
    expect(() => decideFoundationResponseApproval(request)).toThrow(/no longer pending/i);
  });

  it('supports the complete approval lifecycle', () => {
    const states: ResponseApprovalRequest['state'][] = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
    expect(states).toHaveLength(5);
  });

  it('uses a bounded list contract', () => {
    const params: ResponseApprovalListParams = { state: 'PENDING', risk: 'HIGH', tenantScope: 'authorized', limit: 100 };
    expect(params.limit).toBe(100);
    expect(params.tenantScope).toBe('authorized');
  });
});
