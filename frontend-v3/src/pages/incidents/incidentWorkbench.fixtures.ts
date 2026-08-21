/**
 * Development-only incident workbench fixtures.
 *
 * This module is resolved only when VITE_USE_FOUNDATION_FIXTURES=true in a
 * Vite development build. Production aliases it to the disabled module so no
 * fictional records can be returned by a production bundle.
 */

import type {
  ActionPreview,
  ActivityEntry,
  ActivityFeedResponse,
  ActivityType,
  AddNoteBody,
  CreateTaskBody,
  ExecuteActionResponse,
  IncidentEventSearchRequest,
  IncidentEventSearchResponse,
  IncidentTask,
  ResponseAction,
  SimilarIncidentsResponse,
  TaskListResponse,
  TaskStatus,
  UpdateTaskBody,
} from './types/incident-workbench.types';

const now = '2026-08-11T13:18:00.000Z';

let tasks: IncidentTask[] = [
  {
    id: 'task-819',
    title: 'Validate the sign-in with the account owner',
    description: 'Use the approved out-of-band channel and record the response.',
    status: 'in_progress',
    assignee: 'Maya Chen',
    priority: 'critical',
    dueAt: '2026-08-11T13:35:00.000Z',
    createdBy: 'Alex Kumar',
    createdAt: '2026-08-11T12:51:00.000Z',
    updatedAt: '2026-08-11T13:04:00.000Z',
    completedAt: null,
    version: 3,
    checklist: [
      { id: 'check-1', label: 'Contact the identity owner', checked: true },
      { id: 'check-2', label: 'Confirm whether the VPN session is expected', checked: false },
    ],
  },
  {
    id: 'task-820',
    title: 'Preserve authentication and VPN telemetry',
    description: 'Capture source events before any disruptive response.',
    status: 'open',
    assignee: 'Maya Chen',
    priority: 'high',
    dueAt: '2026-08-11T13:50:00.000Z',
    createdBy: 'Identity containment playbook',
    createdAt: '2026-08-11T12:53:00.000Z',
    updatedAt: '2026-08-11T12:53:00.000Z',
    completedAt: null,
    version: 1,
    checklist: [
      { id: 'check-3', label: 'Export IdP authentication records', checked: false },
      { id: 'check-4', label: 'Record the collection checksum', checked: false },
    ],
  },
  {
    id: 'task-821',
    title: 'Scope related privileged identities',
    description: null,
    status: 'completed',
    assignee: 'Hive Intelligence',
    priority: 'medium',
    dueAt: null,
    createdBy: 'Maya Chen',
    createdAt: '2026-08-11T12:55:00.000Z',
    updatedAt: '2026-08-11T13:02:00.000Z',
    completedAt: '2026-08-11T13:02:00.000Z',
    version: 2,
    checklist: [],
  },
];

let activity: ActivityEntry[] = [
  {
    id: 'activity-106',
    type: 'note',
    actor: { id: 'usr-41', displayName: 'Maya Chen', avatar: null },
    timestamp: '2026-08-11T13:16:00.000Z',
    content: 'Account owner verification is in progress; no disruptive action has been approved.',
    metadata: {},
  },
  {
    id: 'activity-105',
    type: 'evidence_added',
    actor: { id: 'identity-analytics', displayName: 'Identity analytics', avatar: null },
    timestamp: '2026-08-11T13:09:00.000Z',
    content: 'Unknown device fingerprint was preserved as case evidence.',
    metadata: { evidenceId: 'evidence-12' },
  },
  {
    id: 'activity-104',
    type: 'field_change',
    actor: { id: 'usr-41', displayName: 'Maya Chen', avatar: null },
    timestamp: '2026-08-11T13:04:00.000Z',
    content: 'Incident moved from Open to In progress.',
    metadata: { field: 'status', from: 'open', to: 'in_progress' },
  },
];

const responseActions: ResponseAction[] = [
  {
    id: 'revoke-sessions',
    name: 'Revoke active identity sessions',
    description: 'Invalidate current IdP and VPN sessions after owner validation.',
    category: 'containment',
    targets: ['sarah.chen'],
    enabled: true,
    requiredEntities: ['user'],
  },
  {
    id: 'isolate-endpoint',
    name: 'Isolate endpoint',
    description: 'Restrict network access while preserving the management channel.',
    category: 'containment',
    targets: ['FIN-WKS-044'],
    enabled: true,
    requiredEntities: ['host'],
  },
  {
    id: 'collect-live-response',
    name: 'Collect volatile endpoint evidence',
    description: 'Collect running process and network state without changing host state.',
    category: 'investigation',
    targets: ['FIN-WKS-044'],
    enabled: true,
    requiredEntities: ['host'],
  },
];

const events = [
  { '@timestamp': '2026-08-11T13:11:42.000Z', 'event.action': 'vpn_login', 'user.name': 'sarah.chen', 'source.ip': '203.0.113.77', 'host.name': 'FIN-WKS-044' },
  { '@timestamp': '2026-08-11T13:07:18.000Z', 'event.action': 'authentication_failure', 'user.name': 'sarah.chen', 'source.ip': '203.0.113.77', 'host.name': 'FIN-WKS-044' },
  { '@timestamp': '2026-08-11T13:06:51.000Z', 'event.action': 'authentication_failure', 'user.name': 'sarah.chen', 'source.ip': '203.0.113.77', 'host.name': 'FIN-WKS-044' },
  { '@timestamp': '2026-08-11T13:05:09.000Z', 'event.action': 'device_registered', 'user.name': 'sarah.chen', 'source.ip': '203.0.113.77', 'host.name': 'FIN-WKS-044' },
];

export async function fixtureListTasks(status?: TaskStatus): Promise<TaskListResponse> {
  const items = status ? tasks.filter((task) => task.status === status) : tasks;
  return { items: structuredClone(items), cursor: null, total: items.length };
}

export async function fixtureCreateTask(body: CreateTaskBody): Promise<IncidentTask> {
  const created: IncidentTask = {
    id: `task-${String(Date.now())}`,
    title: body.title,
    description: body.description ?? null,
    status: 'open',
    assignee: body.assignee ?? null,
    priority: body.priority ?? 'medium',
    dueAt: body.dueAt ?? null,
    createdBy: 'Maya Chen',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    version: 1,
    checklist: (body.checklist ?? []).map((item, index) => ({ id: `new-${String(index)}`, label: item.label, checked: false })),
  };
  tasks = [created, ...tasks];
  return structuredClone(created);
}

export async function fixtureUpdateTask(taskId: string, body: UpdateTaskBody): Promise<IncidentTask> {
  const current = tasks.find((task) => task.id === taskId);
  if (!current) throw new Error('Fixture task not found');
  const checklist = body.checklist
    ? current.checklist.map((item) => {
        const patch = body.checklist?.find((candidate) => candidate.id === item.id);
        return patch ? { ...item, ...patch } : item;
      })
    : current.checklist;
  const updated: IncidentTask = { ...current, ...body, checklist, updatedAt: now, version: current.version + 1 };
  tasks = tasks.map((task) => task.id === taskId ? updated : task);
  return structuredClone(updated);
}

export async function fixtureFindSimilar(): Promise<SimilarIncidentsResponse> {
  return {
    total: 2,
    items: [
      {
        incidentId: '4712',
        title: 'Privileged VPN login from newly observed infrastructure',
        status: 'resolved',
        severity: 'high',
        createdAt: '2026-07-29T04:20:00.000Z',
        closedAt: '2026-07-29T06:41:00.000Z',
        similarity: 0.91,
        reasons: [
          { type: 'shared_entity', description: 'Same privileged identity', weight: 0.42, evidence: ['sarah.chen'] },
          { type: 'same_rule', description: 'Same authentication correlation rule', weight: 0.31, evidence: ['HA-ID-104'] },
        ],
      },
      {
        incidentId: '4659',
        title: 'Successful identity access after repeated failures',
        status: 'closed',
        severity: 'medium',
        createdAt: '2026-07-21T18:12:00.000Z',
        closedAt: '2026-07-21T19:36:00.000Z',
        similarity: 0.74,
        reasons: [
          { type: 'shared_indicator', description: 'Same provider and device posture', weight: 0.28, evidence: ['vpn', 'unknown-device'] },
          { type: 'semantic_summary', description: 'Similar investigation narrative', weight: 0.22, evidence: [] },
        ],
      },
    ],
  };
}

export async function fixtureSearchEvents(body: IncidentEventSearchRequest): Promise<IncidentEventSearchResponse> {
  const query = body.query.trim().toLowerCase();
  const items = !query || query === '*'
    ? events
    : events.filter((event) => JSON.stringify(event).toLowerCase().includes(query.replace(/[":]/g, '')));
  return { items: structuredClone(items), cursor: null, total: items.length, truncated: false };
}

export async function fixtureListResponseActions(): Promise<ResponseAction[]> {
  return structuredClone(responseActions);
}

export async function fixturePreviewAction(actionId: string): Promise<ActionPreview> {
  const action = responseActions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error('Fixture response action not found');
  return {
    actionId,
    name: action.name,
    targets: action.targets.map((target) => ({ id: target, type: 'entity', value: target })),
    impact: {
      description: action.category === 'investigation'
        ? 'Read-only collection. No target state will be changed.'
        : 'The selected target may temporarily lose access to corporate resources.',
      affectedSystems: action.targets,
      reversible: actionId !== 'revoke-sessions',
    },
    previewToken: `fixture-preview-${actionId}`,
    expiresAt: '2026-08-11T13:23:00.000Z',
    executionReady: true,
  };
}

export async function fixtureExecuteAction(actionId: string): Promise<ExecuteActionResponse> {
  return { jobId: `fixture-job-${actionId}`, status: 'approval_required' };
}

export async function fixtureGetActivity(types?: ActivityType[]): Promise<ActivityFeedResponse> {
  const items = types?.length ? activity.filter((entry) => types.includes(entry.type)) : activity;
  return { items: structuredClone(items), cursor: null };
}

export async function fixtureAddNote(body: AddNoteBody): Promise<ActivityEntry> {
  const created: ActivityEntry = {
    id: `activity-${String(Date.now())}`,
    type: 'note',
    actor: { id: 'usr-41', displayName: 'Maya Chen', avatar: null },
    timestamp: now,
    content: body.content,
    metadata: { mentions: body.mentions ?? [] },
  };
  activity = [created, ...activity];
  return structuredClone(created);
}
