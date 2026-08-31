import { describe, expect, it } from 'vitest';

import {
  CMP_GOVERNANCE_MUTATE_DENIED_TITLE,
  canMutateComplianceGovernance,
} from './compliance.capabilities';

describe('compliance.capabilities', () => {
  it('allows governance mutations for Platform Administrator and SOC Manager', () => {
    expect(canMutateComplianceGovernance(['ROLE_ADMIN'])).toBe(true);
    expect(canMutateComplianceGovernance(['ROLE_SOC_MANAGER'])).toBe(true);
  });

  it('denies governance mutations for read-only and analyst roles', () => {
    expect(canMutateComplianceGovernance(['ROLE_ANALYST'])).toBe(false);
    expect(canMutateComplianceGovernance(['ROLE_READ_ONLY'])).toBe(false);
    expect(canMutateComplianceGovernance(['ROLE_USER'])).toBe(false);
    expect(canMutateComplianceGovernance([])).toBe(false);
    expect(canMutateComplianceGovernance(undefined)).toBe(false);
  });

  it('uses human-readable denied title', () => {
    expect(CMP_GOVERNANCE_MUTATE_DENIED_TITLE).toContain('Platform Administrator');
    expect(CMP_GOVERNANCE_MUTATE_DENIED_TITLE).toContain('SOC Manager');
    expect(CMP_GOVERNANCE_MUTATE_DENIED_TITLE).not.toContain('ROLE_');
  });
});
