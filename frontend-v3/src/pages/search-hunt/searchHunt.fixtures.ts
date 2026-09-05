import type {
  HuntEvent,
  HuntEventDetail,
  HuntEventDetailResponse,
  HuntEventField,
  HuntFieldDefinition,
  HuntFieldValuesResponse,
  HuntFieldStatsResponse,
  HuntHistogramBucket,
  HuntSearchRequest,
  HuntSearchResponse,
  Pivot,
} from './searchHunt.types';

import type { SavedHuntDTO } from '@/types/search';

export const foundationSavedHunts: SavedHuntDTO[] = [
  { id: 901, huntName: 'Encoded execution with egress', queryDsl: 'event.action:process_start AND process.name:powershell.exe', nlQuery: null, filterJson: null, createdBy: 'maya.chen', createdAt: '2026-08-03T05:18:00.000Z', isShared: false, lastUsedAt: '2026-08-03T07:20:00.000Z' },
  { id: 902, huntName: 'Privileged authentication failures', queryDsl: 'event.category:authentication AND event.action:logon_failed', nlQuery: null, filterJson: null, createdBy: 'detection-team', createdAt: '2026-08-02T16:42:00.000Z', isShared: true, lastUsedAt: '2026-08-03T06:58:00.000Z' },
  { id: 903, huntName: 'Low-prevalence outbound DNS', queryDsl: 'event.action:dns_query AND destination.ip:*', nlQuery: null, filterJson: null, createdBy: 'maya.chen', createdAt: '2026-08-01T09:05:00.000Z', isShared: false, lastUsedAt: null },
];

export const foundationHuntFields: HuntFieldDefinition[] = [
  { name: '@timestamp', label: 'Event time', type: 'date', category: 'event', description: 'Time the source event occurred.', operators: ['>=', '<=', ':'], coverage: 100, cardinality: 240 },
  { name: 'event.severity', label: 'Severity', type: 'keyword', category: 'event', description: 'Normalized security severity.', operators: [':', '!='], coverage: 100, cardinality: 5, sampleValues: ['critical', 'high', 'medium', 'low', 'info'] },
  { name: 'event.category', label: 'Category', type: 'keyword', category: 'event', description: 'Normalized event category.', operators: [':', '!='], coverage: 100, cardinality: 5, sampleValues: ['process', 'authentication', 'network', 'malware', 'file'] },
  { name: 'event.action', label: 'Action', type: 'keyword', category: 'event', description: 'Normalized action observed by the source.', operators: [':', '!='], coverage: 100, cardinality: 8, sampleValues: ['process_start', 'logon_failed', 'dns_query', 'file_write'] },
  { name: 'host.name', label: 'Host', type: 'keyword', category: 'host', description: 'Normalized endpoint hostname.', operators: [':', '!='], coverage: 92, cardinality: 8, sampleValues: ['FIN-WKS-044', 'IDM-DC-02', 'PAY-APP-07'] },
  { name: 'user.name', label: 'User', type: 'keyword', category: 'identity', description: 'Normalized user or service identity.', operators: [':', '!='], coverage: 78, cardinality: 10, sampleValues: ['sarah.chen', 'svc-backup', 'maya.chen'] },
  { name: 'source.ip', label: 'Source IP', type: 'ip', category: 'network', description: 'Originating IP address.', operators: [':', '!='], coverage: 86, cardinality: 18, sampleValues: ['10.44.8.19', '172.22.4.7', '198.51.100.42'] },
  { name: 'destination.ip', label: 'Destination IP', type: 'ip', category: 'network', description: 'Destination IP address.', operators: [':', '!='], coverage: 71, cardinality: 9, sampleValues: ['203.0.113.84', '10.44.0.12', '192.0.2.77'] },
  { name: 'process.name', label: 'Process', type: 'keyword', category: 'process', description: 'Executable process name.', operators: [':', '!='], coverage: 56, cardinality: 14, sampleValues: ['powershell.exe', 'rundll32.exe', 'lsass.exe'] },
  { name: 'data_stream.dataset', label: 'Dataset', type: 'keyword', category: 'source', description: 'Source integration dataset.', operators: [':', '!='], coverage: 100, cardinality: 6, sampleValues: ['windows.security', 'endpoint.events.process', 'dns.query'] },
];

const seeds = [
  ['critical', 'endpoint.events.process', 'process', 'process_start', 'FIN-WKS-044', 'sarah.chen', '10.44.8.19', '203.0.113.84', 'powershell.exe', 'Encoded PowerShell created a hidden download cradle and contacted a newly observed domain.'],
  ['high', 'windows.security', 'authentication', 'logon_failed', 'IDM-DC-02', 'svc-backup', '172.22.4.7', '10.44.0.12', 'lsass.exe', 'Service account produced 41 failed logons followed by a successful privileged session.'],
  ['medium', 'dns.query', 'network', 'dns_query', 'PAY-APP-07', 'app-payments', '10.44.10.32', '192.0.2.77', 'java', 'Application host resolved a low-prevalence domain after an unsigned child process started.'],
  ['high', 'endpoint.events.file', 'file', 'file_write', 'ENG-LT-118', 'a.patel', '10.44.18.118', '198.51.100.42', 'rundll32.exe', 'Executable content was written into a user startup directory by a signed utility.'],
  ['low', 'firewall.traffic', 'network', 'connection_allowed', 'OPS-JMP-03', 'maya.chen', '10.44.2.15', '10.44.90.8', 'ssh', 'Administrative SSH connection matched the approved jump-host policy.'],
  ['info', 'cloud.audit', 'configuration', 'role_read', null, 'cloud-audit-reader', '198.51.100.17', null, 'cloud-api', 'Read-only role enumeration completed through the approved audit integration.'],
] as const;

const sourceIpVariants = [
  '10.44.8.19', '172.22.4.7', '10.44.10.32', '10.44.18.118', '10.44.2.15', '198.51.100.17',
  '10.44.8.77', '172.22.4.31', '10.44.10.91', '10.44.18.64', '10.44.2.204', '198.51.100.42',
  '10.71.5.14', '172.30.9.28', '192.0.2.61', '10.81.12.44', '203.0.113.17', '10.91.3.126',
] as const;

function valueAt(seed: typeof seeds[number], index: number): string | null { return seed[index] as string | null; }

export const foundationHuntEvents: HuntEvent[] = Array.from({ length: 240 }, (_, index) => {
  const seed = seeds[index % seeds.length];
  const timestamp = new Date(Date.UTC(2026, 7, 3, 7, 42 - index * 2, index * 7));
  const id = `EVT-26-${String(8421 - index).padStart(6, '0')}`;
  const host = valueAt(seed, 4);
  const user = valueAt(seed, 5);
  const sourceIp = sourceIpVariants[index % sourceIpVariants.length] ?? valueAt(seed, 6);
  const destinationIp = valueAt(seed, 7);
  const processName = valueAt(seed, 8);
  const normalized = {
    '@timestamp': timestamp.toISOString(),
    'event.severity': seed[0],
    'event.category': seed[2],
    'event.action': seed[3],
    'host.name': host,
    'user.name': user,
    'source.ip': sourceIp,
    'destination.ip': destinationIp,
    'process.name': processName,
    'data_stream.dataset': seed[1],
  };
  return {
    id,
    timestamp: timestamp.toISOString(),
    ingestedAt: new Date(timestamp.getTime() + (index % 4 + 1) * 19_000).toISOString(),
    severity: seed[0],
    dataSource: seed[1].split('.')[0],
    dataset: seed[1],
    category: seed[2],
    action: seed[3],
    host,
    user,
    sourceIp,
    destinationIp,
    message: seed[9],
    tenantId: index % 3 === 0 ? 'northstar' : index % 3 === 1 ? 'meridian' : 'aegis',
    tenantName: index % 3 === 0 ? 'Northstar Finance' : index % 3 === 1 ? 'Meridian Health' : 'Aegis Public Sector',
    alertCount: index % 7 === 0 ? 2 : index % 5 === 0 ? 1 : 0,
    normalized,
  };
});

const foundationSearchSnapshots = new Map<string, HuntEvent[]>();

function matchesTerm(event: HuntEvent, term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed || trimmed === '*' || trimmed === '*:*') return true;
  const match = trimmed.match(/^([@\w.]+)\s*(!=|:)\s*"?([^"]+)"?$/);
  if (!match) return JSON.stringify(event).toLowerCase().includes(trimmed.toLowerCase().replace(/\*/g, ''));
  const [, field, operator, raw] = match;
  const value = String(event.normalized[field] ?? '').toLowerCase();
  const needle = raw.replace(/\*/g, '').toLowerCase();
  const included = raw === '*' ? value.length > 0 : value.includes(needle);
  return operator === '!=' ? !included : included;
}

function matchesQuery(event: HuntEvent, query: string): boolean {
  return query.split(/\s+OR\s+/i).some((group) => group.split(/\s+AND\s+/i).every((term) => matchesTerm(event, term)));
}

function buildHistogram(events: HuntEvent[], from: Date, to: Date): HuntHistogramBucket[] {
  const bucketCount = 24;
  const width = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / bucketCount));
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketFrom = new Date(from.getTime() + index * width);
    const bucketTo = new Date(Math.min(to.getTime(), bucketFrom.getTime() + width));
    return {
      from: bucketFrom.toISOString(),
      to: bucketTo.toISOString(),
      count: events.filter((event) => {
        const time = Date.parse(event.timestamp);
        return time >= bucketFrom.getTime() && time < bucketTo.getTime();
      }).length,
    };
  });
}

export async function executeFoundationHunt(request: HuntSearchRequest, signal?: AbortSignal): Promise<HuntSearchResponse> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 280);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Search cancelled', 'AbortError'));
    }, { once: true });
  });
  const from = new Date(request.timeRange.from);
  const to = new Date(request.timeRange.to);
  const filtered = foundationHuntEvents.filter((event) => {
    const time = Date.parse(event.timestamp);
    return time >= from.getTime() && time <= to.getTime() && matchesQuery(event, request.query);
  });
  const searchId = 'HUNT-FIXTURE-260803-074218';
  foundationSearchSnapshots.set(searchId, filtered);
  const offset = request.cursor ? Number(request.cursor.replace('fixture-', '')) : 0;
  const items = filtered.slice(offset, offset + request.limit);
  const nextOffset = offset + items.length;
  return {
    searchId,
    items,
    nextCursor: nextOffset < filtered.length ? `fixture-${nextOffset}` : null,
    hasMore: nextOffset < filtered.length,
    snapshotAt: '2026-08-03T07:44:18.000Z',
    totalApproximate: filtered.length,
    totalIsExact: true,
    tookMs: 184,
    histogram: request.includeHistogram ? buildHistogram(filtered, from, to) : [],
    partialFailures: [],
  };
}

function quoteKqlValue(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return /[\s:()]/.test(value) ? `"${escaped}"` : escaped;
}

export async function getFoundationHuntFieldValues(
  searchId: string,
  field: string,
  cursor: string | null,
  query: string,
  signal?: AbortSignal,
): Promise<HuntFieldValuesResponse> {
  if (signal?.aborted) throw new DOMException('Field value request cancelled', 'AbortError');
  const counts = new Map<string, number>();
  const snapshotEvents = foundationSearchSnapshots.get(searchId) ?? foundationHuntEvents;
  for (const event of snapshotEvents) {
    const rawValue = event.normalized[field];
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    const value = String(rawValue);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const needle = query.trim().toLocaleLowerCase();
  const values = [...counts.entries()]
    .filter(([value]) => !needle || value.toLocaleLowerCase().includes(needle))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const offset = cursor ? Number(cursor.replace('field-fixture-', '')) : 0;
  const page = values.slice(offset, offset + 10);
  const nextOffset = offset + page.length;
  return {
    field,
    searchId,
    items: page.map(([value, count]) => ({
      value,
      count,
      countIsExact: true,
      includeQuery: `${field}:${quoteKqlValue(value)}`,
      excludeQuery: `${field}!=${quoteKqlValue(value)}`,
    })),
    nextCursor: nextOffset < values.length ? `field-fixture-${nextOffset}` : null,
    hasMore: nextOffset < values.length,
    totalDistinctApproximate: values.length,
    totalIsExact: true,
    state: 'available',
    snapshotAt: '2026-08-03T07:44:18.000Z',
  };
}

export function getFoundationHuntFieldStats(searchId: string): HuntFieldStatsResponse {
  const snapshotEvents = foundationSearchSnapshots.get(searchId) ?? foundationHuntEvents;
  const totalDocs = snapshotEvents.length;
  const fields = foundationHuntFields.map((definition) => {
    const distinct = new Set<string>();
    let present = 0;
    for (const event of snapshotEvents) {
      const raw = event.normalized[definition.name];
      if (raw === null || raw === undefined || raw === '') continue;
      present += 1;
      distinct.add(String(raw));
    }
    return {
      name: definition.name,
      coverage: totalDocs > 0 ? Math.round((present * 1000) / totalDocs) / 10 : null,
      cardinality: distinct.size,
    };
  });
  return {
    searchId,
    totalDocs,
    totalIsExact: true,
    fields,
    state: 'available',
    snapshotAt: '2026-08-03T07:44:18.000Z',
  };
}

export function getFoundationHuntEventDetail(eventId: string): HuntEventDetail {
  const event = foundationHuntEvents.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error('Event is no longer available in this snapshot.');
  return {
    ...event,
    sourceIndex: `_v3_hive_event-2026.08.03`,
    schemaVersion: 'ECS 8.17 / Hive normalized v3',
    integrityStatus: 'verified',
    rawRecord: {
      event_id: event.id,
      observed_at: event.timestamp,
      sensor: event.dataSource,
      payload: event.message,
      src_addr: event.sourceIp,
      dst_addr: event.destinationIp,
      hostname: event.host,
      account: event.user,
    },
    redactedFields: [],
    availablePivots: [
      ...(event.host ? [{ id: 'host', label: `Hunt host ${event.host}`, query: `host.name:"${event.host}"` }] : []),
      ...(event.user ? [{ id: 'user', label: `Hunt user ${event.user}`, query: `user.name:"${event.user}"` }] : []),
      ...(event.sourceIp ? [{ id: 'source', label: `Hunt source ${event.sourceIp}`, query: `source.ip:${event.sourceIp}` }] : []),
    ],
    permissions: { viewRaw: true, addEvidence: true, createInvestigation: true, createIncident: true },
  };
}

/** Fixture event-detail RESPONSE (fields + raw + pivots) for the EventDetailFlyout's fetchHuntEvent
 *  path. Kept separate from getFoundationHuntEventDetail (a different shape) so the flyout renders in
 *  fixture mode. Fixture-only — never shipped to production. */
export function getFoundationHuntEventResponse(
  eventId: string,
  view: 'highlighted' | 'raw',
): HuntEventDetailResponse {
  const event = foundationHuntEvents.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error('Event is no longer available in this snapshot.');

  const groupFor = (key: string): string => {
    if (key.startsWith('event.')) return 'Detection';
    if (key.startsWith('source.') || key.startsWith('destination.')) return 'Network';
    if (key.startsWith('host.') || key.startsWith('user.') || key.startsWith('process.')) return 'Assets';
    return 'Context';
  };
  const emphasisFor = (key: string): HuntEventField['emphasis'] =>
    key === 'event.severity' ? 'critical' : key === 'event.action' ? 'warning' : 'neutral';

  const fields: HuntEventField[] = Object.entries(event.normalized).map(([key, raw], order) => {
    const value = String(raw ?? '');
    const escaped = value.replace(/"/g, '\\"');
    return {
      key,
      value,
      type: key.endsWith('.ip') ? 'ip' : key === '@timestamp' ? 'date' : 'keyword',
      emphasis: emphasisFor(key),
      order,
      group: groupFor(key),
      includeQuery: value ? `${key}:"${escaped}"` : '',
      excludeQuery: value ? `NOT ${key}:"${escaped}"` : '',
    };
  });

  const pivots: Pivot[] = [
    ...(event.host ? [{ id: 'host', label: `Hunt host ${event.host}`, description: 'All activity for this host', field: 'host.name', value: event.host, query: `host.name:"${event.host}"`, signature: 'host', icon: 'server', category: 'Assets' }] : []),
    ...(event.user ? [{ id: 'user', label: `Hunt user ${event.user}`, description: 'All activity for this user', field: 'user.name', value: event.user, query: `user.name:"${event.user}"`, signature: 'user', icon: 'user', category: 'Assets' }] : []),
    ...(event.sourceIp ? [{ id: 'source', label: `Hunt source ${event.sourceIp}`, description: 'All activity from this source IP', field: 'source.ip', value: event.sourceIp, query: `source.ip:${event.sourceIp}`, signature: 'source', icon: 'network', category: 'Network' }] : []),
  ];

  return {
    fields: view === 'raw' ? undefined : fields,
    raw: {
      event_id: event.id,
      '@timestamp': event.timestamp,
      ...event.normalized,
      message: event.message,
      tenant: event.tenantName,
    },
    pivots,
  };
}
