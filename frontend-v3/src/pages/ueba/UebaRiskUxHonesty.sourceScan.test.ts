import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { UEBA_RISK_JOB_SENTENCE } from './risk/RiskDashboardPage';

describe('Prompt 14 UEBA Risk UX honesty', () => {
  const riskPage = readFileSync(join(process.cwd(), 'src/pages/ueba/risk/RiskDashboardPage.tsx'), 'utf8');
  const riskCss = readFileSync(join(process.cwd(), 'src/pages/ueba/risk/RiskDashboardPage.css'), 'utf8');
  const riskTable = readFileSync(join(process.cwd(), 'src/pages/ueba/risk/UserRiskTable.tsx'), 'utf8');
  const uebaService = readFileSync(join(process.cwd(), 'src/services/ueba.service.ts'), 'utf8');

  it('exports UEBA risk job sentence distinct from entities and intelligence', () => {
    expect(UEBA_RISK_JOB_SENTENCE).toMatch(/UEBA risk overview/i);
    expect(UEBA_RISK_JOB_SENTENCE).toMatch(/behavioral|timeline|anomal/i);
    expect(UEBA_RISK_JOB_SENTENCE).not.toMatch(/Entity inventory/i);
    expect(UEBA_RISK_JOB_SENTENCE).not.toMatch(/Threat intelligence/i);
    expect(riskPage).toContain('UEBA_RISK_JOB_SENTENCE');
  });

  it('keeps sibling meta links for mission, search, entities, intelligence, investigations, incidents', () => {
    expect(riskPage).toContain('to="/dashboard"');
    expect(riskPage).toContain('to="/search"');
    expect(riskPage).toContain('to="/entities"');
    expect(riskPage).toContain('to="/intelligence"');
    expect(riskPage).toContain('to="/investigations"');
    expect(riskPage).toContain('to="/incidents"');
  });

  it('uses table-primary layout with min-height 50vh', () => {
    expect(riskCss).toContain('ueba-risk-page__primary');
    expect(riskCss).toContain('min-height: 50vh');
    expect(riskCss).toContain('ueba-risk-table__grid');
  });

  it('wires only confirmed ha-ueba endpoints via ueba.service', () => {
    expect(uebaService).toContain('/ha-ueba/risk-scores');
    expect(uebaService).toContain('/ha-ueba/risk-trend');
    expect(uebaService).toContain('/ha-ueba/anomaly-counts');
    expect(uebaService).toContain('/ha-ueba/entity-timeline');
    expect(riskPage).not.toContain('window.dispatchEvent');
    expect(riskPage).toContain('ueba-create-incident-guidance');
    expect(riskPage).toContain('/search?q=');
  });

  it('shows staging honesty when all panels empty', () => {
    expect(riskPage).toContain('ueba-risk-empty-honesty');
    expect(riskPage).toContain('STAGING CANDIDATE');
    expect(riskTable).toContain('ueba-risk-table-empty');
  });

  it('uses color-mix for anomaly chip backgrounds', () => {
    expect(riskPage).toContain('color-mix(in srgb');
    expect(riskPage).not.toMatch(/backgroundColor:\s*chip\.color/);
  });
});
