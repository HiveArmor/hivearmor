export type FoundationSeverity = 'critical' | 'high' | 'medium' | 'healthy' | 'info' | 'stale';

export interface FoundationMetric {
  label: string;
  value: string;
  detail: string;
  trend: string;
  state: FoundationSeverity;
  route: string;
}

export interface FoundationPriorityItem {
  id: string;
  title: string;
  type: string;
  tenant: string;
  owner: string;
  age: string;
  sla: string;
  severity: 'critical' | 'high' | 'medium';
  /** Optional deep link (live incidents use /incidents/{id}). */
  route?: string;
}

export const foundationMetrics: FoundationMetric[] = [
  { label: 'Critical open incidents', value: '12', detail: '3 escalated this shift', trend: '+2 vs prior shift', state: 'critical', route: '/incidents' },
  { label: 'Critical unassigned alerts', value: '7', detail: 'Oldest waiting 18 min', trend: '2 require triage', state: 'high', route: '/queue' },
  { label: 'SLA at risk', value: '9', detail: 'Within the next 30 min', trend: '+3 since 06:00', state: 'high', route: '/queue' },
  { label: 'Active investigations', value: '24', detail: 'Across 3 tenant scopes', trend: '6 updated recently', state: 'info', route: '/investigations' },
  { label: 'Detection health', value: '99.6%', detail: '2 pipelines delayed', trend: 'Within objective', state: 'healthy', route: '/detection-rules' },
  { label: 'Data ingestion health', value: '98.9%', detail: '1 source disconnected', trend: '1.84M EPS processed', state: 'stale', route: '/posture/sensors' },
];

export const foundationTrend = [
  { time: '00:00', alerts: 168, incidents: 9 },
  { time: '02:00', alerts: 141, incidents: 7 },
  { time: '04:00', alerts: 122, incidents: 6 },
  { time: '06:00', alerts: 196, incidents: 11 },
  { time: '08:00', alerts: 274, incidents: 18 },
  { time: '10:00', alerts: 238, incidents: 15 },
  { time: '12:00', alerts: 302, incidents: 22 },
  { time: '14:00', alerts: 256, incidents: 17 },
  { time: '16:00', alerts: 329, incidents: 26 },
  { time: '18:00', alerts: 288, incidents: 20 },
  { time: '20:00', alerts: 241, incidents: 16 },
  { time: '22:00', alerts: 214, incidents: 13 },
];

export const foundationPriorityWork: FoundationPriorityItem[] = [
  { id: 'INC-2841', title: 'Suspicious privileged-account login', type: 'Incident', tenant: 'Northwind Financial', owner: 'Maya Chen', age: '12 min', sla: '18 min', severity: 'critical' },
  { id: 'INC-2837', title: 'Lateral movement using remote service', type: 'Incident', tenant: 'Aegis Public Sector', owner: 'Unassigned', age: '21 min', sla: '9 min', severity: 'critical' },
  { id: 'ALT-99120', title: 'Repeated MFA fatigue attempts', type: 'Alert', tenant: 'Meridian Health', owner: 'Luis Romero', age: '34 min', sla: '26 min', severity: 'high' },
  { id: 'DET-104', title: 'Detection pipeline delay', type: 'Health', tenant: 'Northwind Financial', owner: 'Platform Ops', age: '8 min', sla: '22 min', severity: 'high' },
  { id: 'ALT-99088', title: 'Encoded PowerShell execution', type: 'Alert', tenant: 'Aegis Public Sector', owner: 'Ari Patel', age: '42 min', sla: '48 min', severity: 'medium' },
];

export const foundationHealth = [
  { label: 'Data ingestion', value: '98.9%', detail: '1 source disconnected', state: 'stale' as const },
  { label: 'Sensor coverage', value: '97.4%', detail: '2,942 of 3,020 reporting', state: 'healthy' as const },
  { label: 'Detection processing', value: '99.6%', detail: 'Median latency 4.2 sec', state: 'healthy' as const },
  { label: 'Response readiness', value: '96.1%', detail: '2 connectors degraded', state: 'info' as const },
  { label: 'Integration health', value: '94.8%', detail: '1 credential expires soon', state: 'high' as const },
];

export const foundationWorkload = [
  { name: 'Maya Chen', assigned: 8, risk: 2, utilization: 82 },
  { name: 'Ari Patel', assigned: 6, risk: 1, utilization: 68 },
  { name: 'Luis Romero', assigned: 5, risk: 2, utilization: 61 },
  { name: 'Unassigned queue', assigned: 7, risk: 4, utilization: 46 },
];

export const foundationActivity = [
  { action: 'Incident escalated', subject: 'INC-2841 · Privileged-account login', actor: 'Maya Chen', time: '3 min ago', state: 'critical' as const },
  { action: 'Playbook completed', subject: 'Contain suspicious endpoint', actor: 'HiveArmor Automation', time: '9 min ago', state: 'healthy' as const },
  { action: 'Alert assigned', subject: 'ALT-99120 · MFA fatigue attempts', actor: 'Shift Lead', time: '14 min ago', state: 'info' as const },
  { action: 'Sensor disconnected', subject: 'mrd-clinic-edge-04', actor: 'Meridian Health', time: '18 min ago', state: 'stale' as const },
  { action: 'Detection rule changed', subject: 'Encoded PowerShell sequence', actor: 'Ari Patel', time: '31 min ago', state: 'info' as const },
];
