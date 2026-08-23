/** Stable fictional dashboards loaded only by the DEV foundation-fixture service branch. */

import type { DashboardPanel, DashboardRecord } from './dashboardOperations.types';

const observedAt = '2026-08-21T11:12:00.000Z';

const missionPanels: DashboardPanel[] = [
  { id: 'open-alerts', title: 'Open alerts', description: 'Authorized alerts awaiting disposition', kind: 'metric', queryLabel: 'Alert state projection', source: 'Alerts', state: 'ready', updatedAt: observedAt, drilldown: '/alerts', position: { x: 0, y: 0, w: 3, h: 2 }, data: { kind: 'metric', value: '184', delta: '+12', trend: 'up', context: '27 critical or high' } },
  { id: 'active-incidents', title: 'Active incidents', description: 'Cases currently in an operational response phase', kind: 'metric', queryLabel: 'Incident workflow projection', source: 'Incidents', state: 'ready', updatedAt: observedAt, drilldown: '/incidents', position: { x: 3, y: 0, w: 3, h: 2 }, data: { kind: 'metric', value: '19', delta: '3 breached', trend: 'flat', context: '7 owned by this shift' } },
  { id: 'ingestion-eps', title: 'Ingestion throughput', description: 'Normalized security events accepted per second', kind: 'metric', queryLabel: 'Live EPS stream', source: 'Pipeline', state: 'ready', updatedAt: observedAt, drilldown: '/admin/pipeline-signals', position: { x: 6, y: 0, w: 3, h: 2 }, data: { kind: 'metric', value: '12,840', delta: '+4.8%', trend: 'up', context: 'consumer lag 0' } },
  { id: 'coverage', title: 'Detection coverage', description: 'Enabled rules with successful recent execution', kind: 'metric', queryLabel: 'Detection health aggregate', source: 'Detection rules', state: 'partial', updatedAt: '2026-08-21T10:57:00.000Z', drilldown: '/detection-rules', position: { x: 9, y: 0, w: 3, h: 2 }, data: { kind: 'metric', value: '87%', delta: '13 attention', trend: 'down', context: 'authoritative coverage contract pending' } },
  { id: 'activity', title: 'Security signal volume', description: 'Alert and finding observations in the active time range', kind: 'line', queryLabel: 'Time-bucketed signal aggregate', source: 'Alerts · Findings', state: 'ready', updatedAt: observedAt, drilldown: '/alerts', position: { x: 0, y: 2, w: 7, h: 4 }, data: { kind: 'series', labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'], series: [{ name: 'Alerts', values: [18, 27, 21, 34, 31, 46, 39, 51] }, { name: 'Correlated findings', values: [4, 6, 5, 9, 8, 12, 10, 14] }] } },
  { id: 'severity', title: 'Open alert severity', description: 'Current authorized open-alert distribution', kind: 'donut', queryLabel: 'Severity terms aggregation', source: 'Alerts', state: 'ready', updatedAt: observedAt, drilldown: '/alerts', position: { x: 7, y: 2, w: 5, h: 4 }, data: { kind: 'distribution', labels: ['Critical', 'High', 'Medium', 'Low', 'Informational'], values: [9, 18, 47, 61, 49] } },
  { id: 'priority-cases', title: 'Priority investigations', description: 'Cases requiring owner or SLA attention', kind: 'table', queryLabel: 'Bounded incident projection', source: 'Incidents', state: 'ready', updatedAt: observedAt, drilldown: '/incidents', position: { x: 0, y: 6, w: 8, h: 4 }, data: { kind: 'table', columns: ['Incident', 'Priority', 'Owner', 'SLA'], rows: [{ Incident: 'INC-4821 · Privileged access', Priority: 'P1', Owner: 'Maya Chen', SLA: 'Breached' }, { Incident: 'INC-4817 · Exfiltration chain', Priority: 'P1', Owner: 'Omar Haddad', SLA: '18m' }, { Incident: 'INC-4809 · Identity abuse', Priority: 'P2', Owner: 'Unassigned', SLA: '42m' }, { Incident: 'INC-4798 · Cloud role drift', Priority: 'P2', Owner: 'Elena Rossi', SLA: '1h 12m' }] } },
  { id: 'live-feed', title: 'Live high-impact signals', description: 'Recent critical and high observations', kind: 'feed', queryLabel: 'Bounded live stream', source: 'Alert stream', state: 'stale', updatedAt: '2026-08-21T11:08:00.000Z', drilldown: '/alerts', position: { x: 8, y: 6, w: 4, h: 4 }, data: { kind: 'feed', rows: [{ time: '16:40:18', severity: 'Critical', summary: 'Credential abuse followed by lateral movement' }, { time: '16:37:02', severity: 'High', summary: 'Encoded PowerShell retrieved remote content' }, { time: '16:34:51', severity: 'High', summary: 'Privileged role assigned outside change window' }] } },
];

function summaryDashboard(overrides: Partial<DashboardRecord> & Pick<DashboardRecord, 'id' | 'title' | 'description'>): DashboardRecord {
  return {
    owner: 'HiveArmor', managed: false, access: 'team', health: 'healthy', tags: ['Security operations'], updatedAt: observedAt,
    version: 4, refreshSeconds: 60, defaultTimeRange: 'Last 24 hours', tenantScope: 'All authorized tenants', sourceCount: 3,
    variables: [], panels: missionPanels.slice(0, 4).map((panel, index) => ({ ...panel, id: `${overrides.id}-${index}` })), ...overrides,
  };
}

let dashboards: DashboardRecord[] = [
  summaryDashboard({ id: '101', title: 'SOC Mission Overview', description: 'Shift-level workload, signal volume, incident pressure and pipeline health.', owner: 'HiveArmor', managed: true, access: 'managed', tags: ['Command', 'Shift operations'], version: 12, panels: missionPanels, sourceCount: 6 }),
  summaryDashboard({ id: '102', title: 'Detection Health & Coverage', description: 'Rule execution health, ATT&CK coverage, noisy content and telemetry readiness.', owner: 'Detection Engineering', managed: true, access: 'managed', tags: ['Detection', 'Coverage'], health: 'degraded', updatedAt: '2026-08-21T10:57:00.000Z' }),
  summaryDashboard({ id: '103', title: 'Identity Threat Watch', description: 'Risky identities, privileged activity, authentication anomalies and linked incidents.', owner: 'Identity Security', managed: true, access: 'managed', tags: ['Identity', 'UEBA'], defaultTimeRange: 'Last 7 days' }),
  summaryDashboard({ id: '104', title: 'Endpoint Containment Watch', description: 'Endpoint alert pressure, isolation requests, sensor freshness and response outcomes.', owner: 'Maya Chen', access: 'team', tags: ['Endpoint', 'Response'], version: 7, lastViewedAt: '2026-08-21T11:09:00.000Z' }),
  summaryDashboard({ id: '105', title: 'Cloud Privilege Drift', description: 'High-impact cloud role changes and anomalous control-plane operations.', owner: 'Omar Haddad', access: 'team', health: 'draft', tags: ['Cloud', 'Identity'], refreshSeconds: null, version: 2 }),
  summaryDashboard({ id: '106', title: 'My Investigation Board', description: 'Personal view of owned incidents, evidence tasks and recently hunted entities.', owner: 'Maya Chen', access: 'private', tags: ['Personal'], lastViewedAt: '2026-08-21T10:45:00.000Z' }),
];

export function listDashboardFixtures(): DashboardRecord[] {
  return dashboards.map((dashboard) => structuredClone(dashboard));
}

export function getDashboardFixture(id: string): DashboardRecord | undefined {
  const dashboard = dashboards.find((item) => item.id === id);
  return dashboard ? structuredClone(dashboard) : undefined;
}

export function saveDashboardFixture(dashboard: DashboardRecord): DashboardRecord {
  const now = new Date().toISOString();
  const saved = { ...structuredClone(dashboard), id: dashboard.id || String(Date.now()), updatedAt: now, version: (dashboard.version ?? 0) + 1 };
  const index = dashboards.findIndex((item) => item.id === saved.id);
  if (index >= 0) dashboards[index] = saved;
  else dashboards = [saved, ...dashboards];
  return structuredClone(saved);
}
