import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { foundationCorrelatedFindings } from './correlatedFindings.fixtures';
import {
  buildCorrelatedFindingsFixture,
  CORRELATED_FINDINGS_LIST_CONTRACT,
  findingUiStatusToOffenseStatus,
  isCorrelatedFindingDTO,
  mapOffenseToCorrelatedFinding,
  normalizeCorrelatedFinding,
} from './correlatedFindings.service';

const fullWindow = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-03T00:00:00.000Z',
  view: 'all' as const,
  ownership: 'all' as const,
  sort: 'risk_desc' as const,
};

describe('Correlated Findings projection', () => {
  it('keeps fixture identities unique and every record structurally complete', () => {
    expect(new Set(foundationCorrelatedFindings.map((finding) => finding.id)).size).toBe(foundationCorrelatedFindings.length);
    expect(foundationCorrelatedFindings.every(isCorrelatedFindingDTO)).toBe(true);
  });

  it('derives workload metrics from the same time-scoped snapshot', () => {
    const result = buildCorrelatedFindingsFixture(foundationCorrelatedFindings, fullWindow);
    expect(result.summary.total).toBe(foundationCorrelatedFindings.length);
    expect(result.summary.open).toBe(foundationCorrelatedFindings.filter((finding) => finding.status === 'open' || finding.status === 'investigating').length);
    expect(result.summary.critical).toBe(foundationCorrelatedFindings.filter((finding) => finding.severity === 'critical' && finding.status !== 'resolved' && finding.status !== 'false_positive').length);
  });

  it('applies analyst views and deterministic risk ordering before bounding results', () => {
    const result = buildCorrelatedFindingsFixture(foundationCorrelatedFindings, { ...fullWindow, view: 'multi_stage' });
    expect(result.items.every((finding) => finding.mitreTactics.length >= 3 && finding.status !== 'resolved' && finding.status !== 'false_positive')).toBe(true);
    expect(result.items.map((finding) => finding.riskScore)).toEqual([...result.items].sort((left, right) => (right.riskScore ?? -1) - (left.riskScore ?? -1)).map((finding) => finding.riskScore));
    expect(result.items.length).toBeLessThanOrEqual(25);
  });

  it('searches IDs, narrative fields, entities, tenants, and ATT&CK techniques', () => {
    const byEntity = buildCorrelatedFindingsFixture(foundationCorrelatedFindings, { ...fullWindow, search: 'FIN-WKS-044' });
    const byTechnique = buildCorrelatedFindingsFixture(foundationCorrelatedFindings, { ...fullWindow, search: 'T1486' });
    expect(byEntity.items).toHaveLength(1);
    expect(byEntity.items[0].id).toBe('FND-26-0841');
    expect(byTechnique.items.some((finding) => finding.id === 'FND-26-0833')).toBe(true);
  });

  it('normalizes the live correlation-engine producer without inventing a risk score', () => {
    const finding = normalizeCorrelatedFinding({
      findingId: 'e2e-finding-attack-chain-001',
      title: 'Credential access progressed to exfiltration',
      description: 'A bounded multi-stage attack story.',
      severity: 'critical',
      confidence: 0.87,
      alerts: [{ id: 'alert-1', title: 'Brute force login', severity: 'high' }],
      entities: [{ id: 'host-1', type: 'host', value: 'FIN-WKS-044', role: 'target' }],
      timeline: [{ timestamp: '2026-08-10T10:00:00.000Z', stage: 'Initial Access', description: 'Brute force login attempts' }],
      mitreTactics: ['Initial Access', 'Credential Access'],
      '@timestamp': '2026-08-10T10:05:00.000Z',
    });

    expect(finding.id).toBe('e2e-finding-attack-chain-001');
    expect(finding.riskScore).toBeNull();
    expect(finding.confidence).toBe(87);
    expect(finding.entities[0].label).toBe('FIN-WKS-044');
    expect(finding.signals[0].alertId).toBe('alert-1');
    expect(finding.dataCompleteness).toBe('projection');
  });

  it('maps offense documents into honest finding projections', () => {
    const finding = mapOffenseToCorrelatedFinding({
      id: 'off-42',
      name: 'Multi-host credential spray',
      description: 'Related alerts sharing source IP.',
      severity: 'high',
      status: 'reviewing',
      alertCount: 3,
      firstEventTimestamp: '2026-08-10T09:00:00.000Z',
      lastEventTimestamp: '2026-08-10T10:00:00.000Z',
      sourceIps: ['203.0.113.10'],
      targetIps: ['10.0.0.5'],
    }, [{ id: 'a1', title: 'Failed logons', severity: 'high', timestamp: '2026-08-10T09:30:00.000Z' }]);

    expect(finding.id).toBe('off-42');
    expect(finding.status).toBe('investigating');
    expect(finding.signals).toHaveLength(1);
    expect(finding.signals[0].alertId).toBe('a1');
    expect(finding.dataCompleteness).toBe('projection');
    expect(finding.availableActions.find((action) => action.id === 'promote_incident')?.allowed).toBe(false);
  });

  it('maps finding UI status to OffenseResource allowlisted values', () => {
    expect(findingUiStatusToOffenseStatus('open')).toBe('open');
    expect(findingUiStatusToOffenseStatus('investigating')).toBe('reviewing');
    expect(findingUiStatusToOffenseStatus('resolved')).toBe('closed');
    expect(findingUiStatusToOffenseStatus('false_positive')).toBe('dismissed');
    expect(findingUiStatusToOffenseStatus('incident_created')).toBe('promoted');
  });
});

describe('Correlated Findings performance boundaries', () => {
  it('keeps both routes lazy and list contract on offenses without AG Grid', async () => {
    const routerSource = await import('@/router/index.tsx?raw');
    const listSource = await import('./CorrelatedFindingsPage.tsx?raw');
    const detailSource = await import('./CorrelatedFindingDetailPage.tsx?raw');
    const serviceSource = await import('./correlatedFindings.service.ts?raw');

    expect(routerSource.default).toContain("import('@/pages/correlated-findings/CorrelatedFindingsPage')");
    expect(routerSource.default).toContain("import('@/pages/correlated-findings/CorrelatedFindingDetailPage')");
    expect(listSource.default).not.toContain('SiemDataGrid');
    expect(listSource.default).not.toContain('echarts');
    expect(listSource.default).toContain('CORRELATED_FINDINGS_JOB_SENTENCE');
    expect(listSource.default).toContain('<HaCompactSelect');
    expect(listSource.default).toContain('className="correlated-findings-sticky"');
    expect(listSource.default).toContain('to="/alerts"');
    expect(listSource.default).toContain('to="/queue"');
    expect(listSource.default).toContain('to="/incidents"');
    expect(listSource.default).toContain('to="/dashboard"');
    expect(detailSource.default).not.toContain('reactflow');
    expect(serviceSource.default).toContain('/ha-correlated-findings/');
    expect(serviceSource.default).toContain('getOffenses');
    expect(serviceSource.default).toContain('getOffenseAlerts');
    expect(serviceSource.default).toContain('const RESULT_LIMIT = 25');
    expect(CORRELATED_FINDINGS_LIST_CONTRACT).toBe('GET /api/offenses');
    expect(routerSource.default).toContain('OffenseIdRedirect');
    expect(routerSource.default).toContain('ALERT_QUEUE_ROLES');
  });

  it('keeps correlated cards in document flow with list-primary workspace', () => {
    const cssSource = readFileSync(join(__dirname, 'CorrelatedFindingsPage.css'), 'utf8');
    const workbenchCssSource = readFileSync(join(__dirname, 'FindingWorkbench.css'), 'utf8');

    expect(cssSource).toContain('.correlated-findings-sticky { position: sticky');
    expect(cssSource).toContain('minmax(0, 58%)');
    expect(cssSource).not.toContain('.correlated-findings-metrics {');
    expect(cssSource).toContain('.correlation-feed__list { min-height: 0; flex: 0 0 auto; overflow: visible');
    expect(cssSource).toContain('content-visibility: auto');
    expect(cssSource).toContain('.correlation-preview .finding-workbench__body { flex: 0 0 auto; overflow-x: hidden; overflow-y: visible; }');
    expect(workbenchCssSource).toContain(".finding-workbench[data-compact='true'] .finding-evidence { width: 100%; min-width: 0; max-width: 100%; }");
    expect(workbenchCssSource).toContain(".finding-workbench[data-compact='true'] .finding-relationships { width: 100%; min-width: 0; max-width: 100%; grid-template-columns: minmax(0, 1fr); }");
  });
});
