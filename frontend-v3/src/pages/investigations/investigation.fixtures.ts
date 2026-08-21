import type {
  CreateInvestigationInput,
  InvestigationDetail,
  InvestigationListParams,
  InvestigationPageResult,
  InvestigationSession,
  InvestigationSessionItem,
  PinInvestigationItemInput,
  UpdateInvestigationInput,
} from './investigation.types';

const sessions: InvestigationDetail[] = [
  {
    id: 9001,
    sessionName: 'Privileged identity access from new infrastructure',
    description: 'Validate whether the finance administrator session represents credential compromise and scope related access.',
    status: 'ACTIVE', createdBy: 'maya.chen', assignedTo: 'maya.chen', incidentId: null,
    createdAt: '2026-08-11T05:42:00.000Z', updatedAt: '2026-08-11T06:38:00.000Z', itemCount: 11,
    phase: 'assess', hypothesisCount: 3, openHypothesisCount: 2, alertCount: 4, entityCount: 5, eventCount: 128,
    taskCompleted: 4, taskTotal: 7, confidence: 76, freshness: 'current',
    permissions: { edit: true, pin: true, convert: true, delete: true },
    hypothesis: 'A compromised privileged identity established an unauthorized VPN session and attempted access to finance infrastructure.',
    objective: 'Confirm identity compromise, determine affected systems, and preserve evidence before disruptive containment.',
    timeRange: { from: '2026-08-11T04:30:00.000Z', to: '2026-08-11T06:30:00.000Z' },
    dataSources: ['Identity provider', 'VPN gateway', 'Endpoint telemetry', 'Threat intelligence'],
    techniques: ['T1078 Valid Accounts', 'T1133 External Remote Services', 'T1021 Remote Services'],
    hypotheses: [
      { id: 'hyp-1', statement: 'The successful VPN session used compromised credentials.', outcome: 'supported', confidence: 88, technique: 'T1078', confirmingEvidence: ['Unknown device fingerprint', 'First-seen geography', 'Threat-listed source IP'], denyingEvidence: ['Owner verification pending'], owner: 'Maya Chen', updatedAt: '2026-08-11T06:31:00.000Z' },
      { id: 'hyp-2', statement: 'The actor accessed a finance workstation after authentication.', outcome: 'open', confidence: 64, technique: 'T1021', confirmingEvidence: ['Remote service telemetry on FIN-WKS-044'], denyingEvidence: ['No confirmed interactive session'], owner: 'Maya Chen', updatedAt: '2026-08-11T06:25:00.000Z' },
      { id: 'hyp-3', statement: 'The activity is an approved administrator travel exception.', outcome: 'refuted', confidence: 91, technique: 'T1078', confirmingEvidence: [], denyingEvidence: ['No approved travel', 'Device not enrolled'], owner: 'Hive Intelligence', updatedAt: '2026-08-11T06:17:00.000Z' },
    ],
    activity: [
      { id: 'act-1', kind: 'query', actor: 'Maya Chen', summary: 'Ran a two-hour identity and VPN correlation hunt.', occurredAt: '2026-08-11T06:34:00.000Z' },
      { id: 'act-2', kind: 'evidence', actor: 'Maya Chen', summary: 'Pinned the unknown device fingerprint and authentication sequence.', occurredAt: '2026-08-11T06:28:00.000Z' },
      { id: 'act-3', kind: 'automation', actor: 'Hive Intelligence', summary: 'Proposed two competing hypotheses with cited evidence.', occurredAt: '2026-08-11T06:17:00.000Z' },
      { id: 'act-4', kind: 'status', actor: 'Maya Chen', summary: 'Moved the investigation to Assess.', occurredAt: '2026-08-11T06:12:00.000Z' },
    ],
    nextActions: ['Complete identity-owner verification', 'Validate remote session telemetry', 'Decide whether to promote to an incident'],
    conclusion: null,
    artifactsProduced: [
      { type: 'detection', label: 'First-seen privileged VPN session', status: 'draft' },
      { type: 'coverage_gap', label: 'VPN device posture visibility', status: 'ready' },
    ],
  },
  {
    id: 9002, sessionName: 'Encoded PowerShell retrieval across engineering', description: 'Determine prevalence and parent-process lineage for encoded PowerShell activity.', status: 'ACTIVE', createdBy: 'elena.rossi', assignedTo: 'elena.rossi', incidentId: null, createdAt: '2026-08-11T03:18:00.000Z', updatedAt: '2026-08-11T06:12:00.000Z', itemCount: 18, phase: 'execute', hypothesisCount: 2, openHypothesisCount: 2, alertCount: 6, entityCount: 9, eventCount: 384, taskCompleted: 2, taskTotal: 6, confidence: 61, freshness: 'current', permissions: { edit: true, pin: true, convert: true, delete: false }, hypothesis: 'A malicious script used encoded PowerShell to retrieve a second-stage payload.', objective: 'Identify initial execution, affected hosts, and outbound infrastructure.', timeRange: { from: '2026-08-10T18:00:00.000Z', to: '2026-08-11T06:00:00.000Z' }, dataSources: ['Endpoint telemetry', 'DNS', 'Proxy'], techniques: ['T1059.001 PowerShell', 'T1105 Ingress Tool Transfer'], hypotheses: [], activity: [], nextActions: ['Expand prevalence hunt', 'Collect script block logs'], conclusion: null, artifactsProduced: []
  },
  {
    id: 9003, sessionName: 'Service-account authentication anomaly', description: 'Scope repeated failures followed by success for a production service identity.', status: 'ACTIVE', createdBy: 'omar.haddad', assignedTo: 'omar.haddad', incidentId: null, createdAt: '2026-08-10T22:08:00.000Z', updatedAt: '2026-08-11T04:50:00.000Z', itemCount: 9, phase: 'prepare', hypothesisCount: 1, openHypothesisCount: 1, alertCount: 2, entityCount: 3, eventCount: 72, taskCompleted: 1, taskTotal: 5, confidence: 48, freshness: 'partial', permissions: { edit: true, pin: true, convert: true, delete: true }, hypothesis: 'The service identity secret was exposed and tested from an unauthorized workload.', objective: 'Establish whether failures were operational or adversarial.', timeRange: null, dataSources: ['Identity provider'], techniques: ['T1110 Brute Force'], hypotheses: [], activity: [], nextActions: ['Confirm change window', 'Add cloud workload telemetry'], conclusion: null, artifactsProduced: []
  },
  {
    id: 8998, sessionName: 'DNS beaconing to newly registered domains', description: 'Completed hunt across DNS and proxy telemetry.', status: 'CLOSED', createdBy: 'maya.chen', assignedTo: 'maya.chen', incidentId: null, createdAt: '2026-08-08T05:12:00.000Z', updatedAt: '2026-08-09T11:15:00.000Z', itemCount: 14, phase: 'knowledge', hypothesisCount: 2, openHypothesisCount: 0, alertCount: 0, entityCount: 12, eventCount: 591, taskCompleted: 6, taskTotal: 6, confidence: 93, freshness: 'current', permissions: { edit: true, pin: true, convert: true, delete: true }, hypothesis: 'Regular DNS intervals represent malware beaconing.', objective: 'Validate beacon periodicity and affected hosts.', timeRange: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-08T00:00:00.000Z' }, dataSources: ['DNS', 'Proxy'], techniques: ['T1071.004 DNS'], hypotheses: [], activity: [], nextActions: [], conclusion: 'Traffic was generated by an approved endpoint-management service.', artifactsProduced: [{ type: 'negative_result', label: 'Approved endpoint-management DNS behavior', status: 'published' }]
  },
  {
    id: 8994, sessionName: 'Cloud administrator role assignment', description: 'Promoted after confirming unapproved privileged role activation.', status: 'CONVERTED', createdBy: 'james.okafor', assignedTo: 'james.okafor', incidentId: 4827, createdAt: '2026-08-07T09:20:00.000Z', updatedAt: '2026-08-07T12:01:00.000Z', itemCount: 21, phase: 'act', hypothesisCount: 3, openHypothesisCount: 0, alertCount: 5, entityCount: 7, eventCount: 244, taskCompleted: 5, taskTotal: 7, confidence: 96, freshness: 'current', permissions: { edit: false, pin: false, convert: false, delete: false }, hypothesis: 'An unauthorized principal activated a privileged cloud role.', objective: 'Confirm scope and promote confirmed compromise.', timeRange: null, dataSources: ['Cloud audit'], techniques: ['T1098 Account Manipulation'], hypotheses: [], activity: [], nextActions: ['Continue in incident INC-4827'], conclusion: 'Confirmed malicious role activation.', artifactsProduced: [{ type: 'detection', label: 'Rare privileged role activation', status: 'ready' }]
  },
  {
    id: 8989, sessionName: 'Remote service creation baseline review', description: 'Archived duplicate investigation retained for audit context.', status: 'ARCHIVED', createdBy: 'elena.rossi', assignedTo: null, incidentId: null, createdAt: '2026-08-05T07:45:00.000Z', updatedAt: '2026-08-05T09:12:00.000Z', itemCount: 4, phase: 'knowledge', hypothesisCount: 1, openHypothesisCount: 0, alertCount: 1, entityCount: 2, eventCount: 33, taskCompleted: 2, taskTotal: 2, confidence: 82, freshness: 'stale', permissions: { edit: false, pin: false, convert: false, delete: true }, hypothesis: 'Remote service creation indicates lateral movement.', objective: 'Compare activity with deployment tooling.', timeRange: null, dataSources: ['Windows events'], techniques: ['T1021.002 SMB/Windows Admin Shares'], hypotheses: [], activity: [], nextActions: [], conclusion: 'Duplicate of a completed platform deployment review.', artifactsProduced: []
  },
];

const items = new Map<number, InvestigationSessionItem[]>([
  [9001, [
    { id: 7101, sessionId: 9001, itemType: 'ALERT', itemRef: 'ALT-91274', itemSnapshot: JSON.stringify({ title: 'Successful privileged VPN login after repeated failures', severity: 'critical', observedAt: '2026-08-11T05:56:00.000Z' }), note: 'Primary authentication signal.', addedBy: 'maya.chen', addedAt: '2026-08-11T06:28:00.000Z' },
    { id: 7102, sessionId: 9001, itemType: 'ENTITY', itemRef: 'usr-sarah-chen', itemSnapshot: JSON.stringify({ name: 'Sarah Chen', type: 'user', risk: 91 }), note: 'Privileged identity under validation.', addedBy: 'maya.chen', addedAt: '2026-08-11T06:27:00.000Z' },
    { id: 7103, sessionId: 9001, itemType: 'ENTITY', itemRef: 'ip-203-0-113-77', itemSnapshot: JSON.stringify({ name: '203.0.113.77', type: 'ip', risk: 96 }), note: 'Source matched credential-access intelligence.', addedBy: 'maya.chen', addedAt: '2026-08-11T06:26:00.000Z' },
    { id: 7104, sessionId: 9001, itemType: 'LOG_EVENT', itemRef: 'evt-vpn-441', itemSnapshot: JSON.stringify({ action: 'vpn_login', user: 'sarah.chen', sourceIp: '203.0.113.77', timestamp: '2026-08-11T05:56:00.000Z' }), note: 'Successful session event.', addedBy: 'maya.chen', addedAt: '2026-08-11T06:23:00.000Z' },
    { id: 7105, sessionId: 9001, itemType: 'NOTE', itemRef: 'note-owner-verification', itemSnapshot: null, note: 'Account owner verification is pending through the approved out-of-band channel.', addedBy: 'maya.chen', addedAt: '2026-08-11T06:20:00.000Z' },
  ]],
]);

let nextSessionId = 9100;
let nextItemId = 7900;

function copy<T>(value: T): T { return structuredClone(value); }
function delay(ms = 90): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function listFixtureInvestigations(params: InvestigationListParams): Promise<InvestigationPageResult> {
  await delay();
  let filtered = [...sessions];
  if (params.status && params.status !== 'ALL') filtered = filtered.filter((item) => item.status === params.status);
  if (params.ownership === 'mine') filtered = filtered.filter((item) => item.assignedTo === 'maya.chen');
  if (params.search) {
    const query = params.search.toLowerCase();
    filtered = filtered.filter((item) => `${item.id} ${item.sessionName} ${item.description ?? ''} ${item.assignedTo ?? ''}`.toLowerCase().includes(query));
  }
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const start = params.page * params.size;
  return { items: copy(filtered.slice(start, start + params.size)), total: filtered.length, page: params.page, size: params.size, snapshotAt: new Date().toISOString(), filtering: 'authoritative' };
}

export async function getFixtureInvestigation(id: number): Promise<InvestigationDetail> {
  await delay(70);
  const session = sessions.find((item) => item.id === id) ?? sessions[0];
  return copy({ ...session, id });
}

export async function getFixtureInvestigationItems(id: number): Promise<InvestigationSessionItem[]> {
  await delay(70);
  return copy(items.get(id) ?? []);
}

export async function createFixtureInvestigation(input: CreateInvestigationInput): Promise<InvestigationSession> {
  await delay();
  const now = new Date().toISOString();
  const created: InvestigationDetail = { id: ++nextSessionId, sessionName: input.sessionName, description: input.description, status: 'ACTIVE', createdBy: 'maya.chen', assignedTo: input.assignedTo ?? 'maya.chen', incidentId: null, createdAt: now, updatedAt: now, itemCount: 0, phase: 'prepare', hypothesisCount: 0, openHypothesisCount: 0, alertCount: 0, entityCount: 0, eventCount: 0, taskCompleted: 0, taskTotal: 3, confidence: 0, freshness: 'current', permissions: { edit: true, pin: true, convert: true, delete: true }, hypothesis: null, objective: input.description, timeRange: null, dataSources: [], techniques: [], hypotheses: [], activity: [], nextActions: ['Define a specific, testable, bounded hypothesis'], conclusion: null, artifactsProduced: [] };
  sessions.unshift(created);
  return copy(created);
}

export async function updateFixtureInvestigation(id: number, input: UpdateInvestigationInput): Promise<InvestigationSession> {
  await delay();
  const index = sessions.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Investigation not found');
  sessions[index] = { ...sessions[index], ...input, updatedAt: new Date().toISOString() };
  return copy(sessions[index]);
}

export async function pinFixtureInvestigationItem(id: number, input: PinInvestigationItemInput): Promise<InvestigationSessionItem> {
  await delay();
  const item: InvestigationSessionItem = { id: ++nextItemId, sessionId: id, itemType: input.itemType, itemRef: input.itemRef, itemSnapshot: input.itemSnapshot ?? null, note: input.note ?? null, addedBy: 'maya.chen', addedAt: new Date().toISOString() };
  items.set(id, [item, ...(items.get(id) ?? [])]);
  return copy(item);
}

export async function unpinFixtureInvestigationItem(id: number, itemId: number): Promise<void> {
  await delay();
  items.set(id, (items.get(id) ?? []).filter((item) => item.id !== itemId));
}

export async function convertFixtureInvestigation(id: number): Promise<{ incidentId: number }> {
  await delay();
  const session = sessions.find((item) => item.id === id);
  if (session) { session.status = 'CONVERTED'; session.incidentId = 4901; session.updatedAt = new Date().toISOString(); }
  return { incidentId: 4901 };
}
