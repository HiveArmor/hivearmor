import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INV_CONVERT_DISABLED_TITLE,
  INV_CONVERT_TO_INCIDENT,
  INV_GOVERNED_PROMOTION,
} from './investigation.capabilities';

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
    expect(detail).not.toContain('convertInvestigationToIncident');
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
