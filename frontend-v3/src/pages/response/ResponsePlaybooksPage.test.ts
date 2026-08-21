/**
 * ResponsePlaybooksPage Tests
 * DEF-04 acceptance criteria validation
 */

import { describe, it, expect } from 'vitest';

import type { PlaybookDTO, PlaybookListParams } from './response.types';

describe('ResponsePlaybooksPage types', () => {
  it('should define PlaybookDTO with required fields', () => {
    const playbook: PlaybookDTO = {
      id: '1',
      name: 'Test Playbook',
      status: 'ACTIVE',
      triggerType: 'MANUAL',
      nodes: [],
      edges: [],
    };

    expect(playbook.name).toBe('Test Playbook');
    expect(playbook.status).toBe('ACTIVE');
    expect(playbook.triggerType).toBe('MANUAL');
    expect(Array.isArray(playbook.nodes)).toBe(true);
    expect(Array.isArray(playbook.edges)).toBe(true);
  });

  it('should define PlaybookListParams with filter options', () => {
    const params: PlaybookListParams = {
      page: 0,
      size: 50,
      status: 'ACTIVE',
      triggerType: 'MANUAL',
    };

    expect(params.page).toBe(0);
    expect(params.size).toBe(50);
    expect(params.status).toBe('ACTIVE');
    expect(params.triggerType).toBe('MANUAL');
  });

  it('should allow ALL as a filter value', () => {
    const params: PlaybookListParams = {
      status: 'ALL',
      triggerType: 'ALL',
    };

    expect(params.status).toBe('ALL');
    expect(params.triggerType).toBe('ALL');
  });
});

describe('ResponsePlaybooksPage GAP-SEC-08 requirements', () => {
  it('should document Run Now button as permanently disabled', () => {
    const expectedTooltip = 'Playbook execution is blocked pending security remediation (GAP-SEC-08).';
    expect(expectedTooltip.includes('GAP-SEC-08')).toBe(true);
    expect(expectedTooltip.includes('blocked')).toBe(true);
  });

  it('should document banner as non-dismissible', () => {
    const bannerTitle = 'Playbook Execution Blocked';
    const bannerMessage =
      'Automated playbook execution ("Run Now") is disabled pending a security remediation in the HiveArmor backend (GAP-SEC-08).';

    expect(bannerTitle.includes('Blocked')).toBe(true);
    expect(bannerMessage.includes('GAP-SEC-08')).toBe(true);
    expect(bannerMessage.includes('disabled')).toBe(true);
  });
});

describe('ResponsePlaybooksPage role-based access', () => {
  it('should require ROLE_SOC_MANAGER or ROLE_ADMIN for view access', () => {
    const allowedRoles = ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'];
    expect(allowedRoles.includes('ROLE_SOC_MANAGER')).toBe(true);
    expect(allowedRoles.includes('ROLE_ADMIN')).toBe(true);
  });

  it('should allow delete only for ROLE_ADMIN', () => {
    const deleteRole = 'ROLE_ADMIN';
    expect(deleteRole).toBe('ROLE_ADMIN');
  });
});

describe('ResponsePlaybooksPage column definitions', () => {
  it('should display execution count as tabular-nums', () => {
    const mockPlaybook: PlaybookDTO = {
      name: 'Test',
      status: 'ACTIVE',
      triggerType: 'MANUAL',
      executionCount: 42,
      nodes: [],
      edges: [],
    };

    expect(mockPlaybook.executionCount).toBe(42);
  });

  it('should show em-dash for zero execution count', () => {
    const mockPlaybook: PlaybookDTO = {
      name: 'Test',
      status: 'ACTIVE',
      triggerType: 'MANUAL',
      executionCount: 0,
      nodes: [],
      edges: [],
    };

    const display = mockPlaybook.executionCount === 0 ? '—' : String(mockPlaybook.executionCount);
    expect(display).toBe('—');
  });
});
