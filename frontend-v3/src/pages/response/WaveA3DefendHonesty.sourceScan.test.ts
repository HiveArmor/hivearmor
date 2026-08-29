import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RESP_018_EXECUTION_INVENTORY,
  RESP_018_SOAR_AUDIT_PROJECTION,
  RESP_020_APPROVAL_PROJECTION,
  RESP_020_GOVERNANCE,
  RESP_PLAYBOOK_AUDIT,
} from './response.capabilities';

describe('Wave A3 Defend/respond honesty', () => {
  it('enables RESP-018 inventory + RESP-020 approval projection; keeps full governance/audit fail-closed', () => {
    expect(RESP_018_EXECUTION_INVENTORY).toBe(true);
    expect(RESP_018_SOAR_AUDIT_PROJECTION).toBe(true);
    expect(RESP_020_APPROVAL_PROJECTION).toBe(true);
    expect(RESP_020_GOVERNANCE).toBe(false);
    expect(RESP_PLAYBOOK_AUDIT).toBe(false);
  });

  it('A3-ACT-01 / A3-AUTH-01: live services prefer executions inventory + approval projection', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/response/responsePlaybooks.service.ts'), 'utf8');
    expect(source).toContain('RESP_018_EXECUTION_INVENTORY');
    expect(source).toContain('/ha-playbooks/executions');
    expect(source).toContain('/soar/audit');
    expect(source).toContain('RESP_020_GOVERNANCE');
    expect(source).toContain('RESP_020_APPROVAL_PROJECTION');
    expect(source).toContain('/ha-response-governance/approvals');
    expect(source).not.toContain('/ha-playbooks/quarantine');
    expect(source).not.toContain('/ha-action-catalog');
    const page = readFileSync(join(process.cwd(), 'src/pages/response/ResponseActivityPage.tsx'), 'utf8');
    expect(page).toContain('RESPONSE_ACTIVITY_JOB_SENTENCE');
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('activity-empty-honesty');
    const authority = readFileSync(join(process.cwd(), 'src/pages/response/ResponseAuthorityPage.tsx'), 'utf8');
    expect(authority).toContain('RESP_020_APPROVAL_PROJECTION_TITLE');
    expect(authority).toContain('STAGING CANDIDATE');
  });

  it('A3-PB-01: playbook mutate UI is Admin-only (canManage)', () => {
    const list = readFileSync(join(process.cwd(), 'src/pages/response/ResponsePlaybooksPage.tsx'), 'utf8');
    const detail = readFileSync(join(process.cwd(), 'src/pages/response/PlaybookDetailPage.tsx'), 'utf8');
    expect(list).toContain('const canManage = hasAdminRole');
    expect(detail).toContain('const canMutate = hasAdminRole');
  });

  it('A3-LIB-01 / A3-DET-01: nav roles align with page gates', () => {
    const nav = readFileSync(join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'), 'utf8');
    expect(nav).toContain("route: '/response/library', roles: ['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
    expect(nav).toContain("route: '/detection-rules', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']");
    expect(nav).toContain("route: '/admin/threat-intel', roles: ['ROLE_ADMIN']");
  });

  it('A3-PB-03: playbook audit projects from history when /audit is unavailable', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/playbookService.ts'), 'utf8');
    expect(source).toContain('RESP_PLAYBOOK_AUDIT');
    expect(source).toContain('fetchPlaybookExecutions');
    expect(source).toContain("action: 'EXECUTED'");
    const detail = readFileSync(join(process.cwd(), 'src/pages/response/PlaybookDetailPage.tsx'), 'utf8');
    expect(detail).toContain('History projection');
    expect(detail).toContain('RESP_PLAYBOOK_AUDIT_DISABLED_TITLE');
  });

  it('A3-AUTH-01: policy/delegation saves stay fail-closed without full governance', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/response/responsePlaybooks.service.ts'), 'utf8');
    expect(source).toMatch(/saveResponseAuthorityPolicy[\s\S]*?if \(!RESP_020_GOVERNANCE\)/);
    expect(source).toMatch(/saveResponseAuthorityDelegate[\s\S]*?if \(!RESP_020_GOVERNANCE\)/);
  });
});
