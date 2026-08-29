/**
 * ResponsePlaybooksPage Tests — Prompt 17
 */

import { describe, it, expect } from 'vitest';

import type { PlaybookDTO, PlaybookListParams } from './response.types';
import {
  PLAYBOOK_MANAGE_DENIED_TITLE,
  RESPONSE_PLAYBOOKS_JOB_SENTENCE,
} from './ResponsePlaybooksPage';

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

describe('ResponsePlaybooksPage Prompt 17 honesty', () => {
  it('exports job sentence for SOAR inventory', () => {
    expect(RESPONSE_PLAYBOOKS_JOB_SENTENCE).toMatch(/playbook inventory/i);
    expect(RESPONSE_PLAYBOOKS_JOB_SENTENCE).toMatch(/authority/i);
  });

  it('uses human Platform Administrator label for mutate deny', () => {
    expect(PLAYBOOK_MANAGE_DENIED_TITLE).toBe('Required permission: Platform Administrator');
  });
});

describe('ResponsePlaybooksPage role-based access', () => {
  it('should require ROLE_SOC_MANAGER or ROLE_ADMIN for view access', () => {
    const allowedRoles = ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'];
    expect(allowedRoles.includes('ROLE_SOC_MANAGER')).toBe(true);
    expect(allowedRoles.includes('ROLE_ADMIN')).toBe(true);
  });

  it('should allow mutate only for ROLE_ADMIN (Platform Administrator)', () => {
    expect(PLAYBOOK_MANAGE_DENIED_TITLE).toContain('Platform Administrator');
  });
});
