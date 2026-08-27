import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INV_CONVERT_DISABLED_TITLE,
  INV_CONVERT_TO_INCIDENT,
  INV_GOVERNED_PROMOTION,
  INV_PROMOTE_DENIED,
} from './investigation.capabilities';
import { INVESTIGATIONS_JOB_SENTENCE } from './InvestigationsPage';

describe('Investigation promote honesty', () => {
  it('keeps deprecated convert-to-incident fail-closed in live mode', () => {
    expect(INV_CONVERT_TO_INCIDENT).toBe(false);
    expect(INV_CONVERT_DISABLED_TITLE).toMatch(/deprecated/i);
  });

  it('enables governed preview+promote and wires detail UI', () => {
    expect(INV_GOVERNED_PROMOTION).toBe(true);
    const service = readFileSync(join(process.cwd(), 'src/pages/investigations/investigation.service.ts'), 'utf8');
    const detail = readFileSync(join(process.cwd(), 'src/pages/investigations/InvestigationDetailPage.tsx'), 'utf8');
    expect(service).toContain('INV_CONVERT_TO_INCIDENT');
    expect(service).toContain('/promotion-preview');
    expect(service).toContain('/promote');
    expect(service).not.toMatch(/convert-to-incident[\s\S]{0,80}INV_GOVERNED_PROMOTION/);
    expect(detail).toContain('INV_GOVERNED_PROMOTION');
    expect(detail).toContain('previewInvestigationPromotion');
    expect(detail).toContain('promoteInvestigationToIncident');
    expect(detail).toContain('Governed promotion');
    expect(detail).toContain('unpinInvestigationItem');
    expect(detail).not.toContain('convertInvestigationToIncident');
    expect(detail).not.toContain('investigation-phase-rail');
    expect(detail).toContain('INV_PROMOTE_DENIED');
    expect(INV_PROMOTE_DENIED).toMatch(/Platform Administrator|Analyst|SOC Manager/);
    expect(INV_PROMOTE_DENIED).not.toMatch(/ROLE_/);
  });
});

describe('Investigations list IA', () => {
  it('exports evidence-session job sentence and sibling meta links', () => {
    expect(INVESTIGATIONS_JOB_SENTENCE).toMatch(/Working investigations/i);
    expect(INVESTIGATIONS_JOB_SENTENCE).toMatch(/promote/i);
    const list = readFileSync(join(process.cwd(), 'src/pages/investigations/InvestigationsPage.tsx'), 'utf8');
    expect(list).toContain('INVESTIGATIONS_JOB_SENTENCE');
    expect(list).toContain('to="/dashboard"');
    expect(list).toContain('to="/search"');
    expect(list).toContain('to="/alerts"');
    expect(list).toContain('to="/incidents"');
    expect(list).not.toContain('Needs decision');
    expect(list).not.toContain('investigations-metrics');
  });
});

describe('Enrollment audit surface', () => {
  it('routes and navigates to GET /api/ha-agent-enrollments/audit', () => {
    const router = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');
    const nav = readFileSync(join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'), 'utf8');
    const service = readFileSync(join(process.cwd(), 'src/services/enrollmentAudit.service.ts'), 'utf8');
    expect(router).toMatch(/path:\s*'admin\/enrollment-audit'/);
    expect(router).toContain("allowedRoles={['ROLE_ADMIN', 'ROLE_SOC_MANAGER']}");
    expect(nav).toContain("route: '/admin/enrollment-audit'");
    expect(service).toContain('/api/ha-agent-enrollments/audit');
    expect(service).toContain('/api/ha-agent-enrollments/audit/export');
  });
});
