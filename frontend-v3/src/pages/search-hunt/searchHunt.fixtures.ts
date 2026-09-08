import type {
  HistoryEntry,
  HuntAggregateRequest,
  HuntAggregateResponse,
  HuntCrosstabRequest,
  HuntCrosstabResponse,
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
  SavedHunt,
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
  // Fixture events are authored at a fixed base date (Aug 2026). Re-base them onto the requested
  // window so the default "Last 24 hours" filter does not drop everything in fixture mode. We shift
  // by a whole-window delta computed from the newest fixture event to the window end, preserving the
  // relative spacing (and therefore the histogram shape) of the sample set.
  const windowEnd = to.getTime();
  const newestFixture = foundationHuntEvents.reduce((mx, e) => Math.max(mx, Date.parse(e.timestamp)), 0);
  const rebaseDelta = windowEnd - newestFixture;
  const rebased = foundationHuntEvents.map((event) => {
    const shifted = new Date(Date.parse(event.timestamp) + rebaseDelta).toISOString();
    return { ...event, timestamp: shifted, normalized: { ...event.normalized, '@timestamp': shifted } };
  });
  const filtered = rebased.filter((event) => {
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


/** Fixture saved hunts (maps the SavedHuntDTO seed → the SavedHunt UI type). Fixture-only. */
export function getFoundationSavedHunts(params?: { search?: string; tags?: string }): { items: SavedHunt[]; total: number } {
  const tagsFor = (dto: SavedHuntDTO): string[] => {
    // Derive a couple of readable tags from the query so tag-filtering has something to show.
    const t: string[] = [];
    if (/authentication|logon/.test(dto.queryDsl ?? '')) t.push('authentication');
    if (/process_start|powershell/.test(dto.queryDsl ?? '')) t.push('execution');
    if (/dns_query|destination\.ip/.test(dto.queryDsl ?? '')) t.push('network');
    if (dto.isShared) t.push('shared');
    return t;
  };
  const items: SavedHunt[] = foundationSavedHunts.map((dto, index) => ({
    id: String(dto.id),
    name: dto.huntName,
    description: '',
    query: dto.queryDsl ?? '',
    filters: {},
    tags: tagsFor(dto),
    createdBy: dto.createdBy,
    createdAt: dto.createdAt,
    updatedAt: dto.lastUsedAt ?? dto.createdAt,
    lastRunAt: dto.lastUsedAt ?? undefined,
    runCount: [12, 34, 3][index] ?? 1,
    shared: dto.isShared,
  }));
  const needle = params?.search?.trim().toLowerCase();
  const filtered = items.filter((hunt) => {
    if (needle && !hunt.name.toLowerCase().includes(needle)) return false;
    if (params?.tags && !hunt.tags.includes(params.tags)) return false;
    return true;
  });
  // A synthetic Saved Pivot so fixture mode exercises the load-into-Pivot path.
  const pivotItem: SavedHunt = {
    id: 'saved-pivot-1',
    name: 'Failed logons by host × action',
    description: '',
    query: 'event.category:authentication',
    filters: { kind: 'pivot', pivot: { v: 1, rowField: 'host.name', colField: 'event.action', valueFn: 'count', distinctField: null } },
    tags: ['authentication', 'pivot'],
    createdBy: 'analyst1',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    lastRunAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    runCount: 7,
    shared: false,
  };
  const withPivot = (!needle || pivotItem.name.toLowerCase().includes(needle)) && (!params?.tags || pivotItem.tags.includes(params.tags))
    ? [pivotItem, ...filtered]
    : filtered;
  return { items: withPivot, total: withPivot.length };
}

/** Fixture hunt history — synthesized from the first events so the Recent list is populated. */
export function getFoundationHuntHistory(): { items: HistoryEntry[]; total: number } {
  const distinctQueries = [
    'event.category:authentication AND event.action:logon_failed',
    'event.severity:critical',
    'event.action:process_start AND process.name:powershell.exe',
    'host.name:IDM-DC-02',
    'event.action:dns_query',
    'source.ip:172.22.4.7',
  ];
  const items: HistoryEntry[] = distinctQueries.map((query, index) => ({
    id: `hist-${index}`,
    query,
    filters: {},
    executedAt: new Date(Date.now() - (index + 1) * 11 * 60_000).toISOString(),
    duration: 120 + index * 37,
    resultCount: [239, 48, 16, 41, 51, 9][index] ?? 100,
    status: 'completed',
  }));
  return { items, total: items.length };
}

/**
 * Fixture Metric aggregation — derived from the full fixture event set so the Metric view can show
 * "full matched set" numbers in fixture mode (not just a loaded page). Maps the backend registry
 * field names the UI requests to the fixture HuntEvent shape.
 */
export function getFoundationHuntAggregates(request: HuntAggregateRequest): HuntAggregateResponse {
  const events = foundationHuntEvents;
  const pick = (field: string) => (e: HuntEvent): string | null => {
    switch (field) {
      case 'event.severity':
      case 'severity':
        return e.severity;
      case 'dataSource':
        return e.dataSource;
      case 'event.action':
      case 'action':
        return e.action;
      case 'host.name':
      case 'host':
        return e.host;
      case 'user.name':
      case 'user':
        return e.user;
      case 'event.category':
      case 'category':
        return e.category;
      default:
        return null;
    }
  };

  const breakdowns = request.breakdowns.map((spec) => {
    const size = spec.size ?? 8;
    const counts = new Map<string, number>();
    let other = 0;
    for (const e of events) {
      const v = pick(spec.field)(e);
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, size);
    other = sorted.slice(size).reduce((sum, [, c]) => sum + c, 0);
    const esc = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return {
      field: spec.field,
      state: 'available' as const,
      otherCount: other,
      buckets: top.map(([value, count]) => ({
        value,
        count,
        countIsExact: true,
        includeQuery: `${spec.field}:"${esc(value)}"`,
        excludeQuery: `NOT ${spec.field}:"${esc(value)}"`,
      })),
    };
  });

  return {
    searchId: `HUNT-AGG-FIXTURE`,
    totalApproximate: events.length,
    totalIsExact: true,
    snapshotAt: new Date().toISOString(),
    kpis: {
      events: events.length,
      withAlerts: events.filter((e) => e.alertCount > 0).length,
      distinctHosts: new Set(events.map((e) => e.host).filter(Boolean)).size,
      distinctUsers: new Set(events.map((e) => e.user).filter(Boolean)).size,
    },
    breakdowns,
    partialFailures: [],
  };
}

/**
 * Fixture crosstab — derives the same shape as the PR-A backend from the full fixture event set,
 * so the Pivot view renders real numbers in fixture mode. Honest per-scope totals:
 *  - COUNT row/col totals cover the FULL member within pivot-eligible scope (NOT intersected with
 *    the displayed opposite axis), so a row total can exceed the sum of its visible cells.
 *  - DISTINCT totals are computed at their own scope via Set cardinality, never summed from cells.
 *  - grand COUNT = pivot-eligible count; grand DISTINCT = distinct over the eligible set.
 * Axis selection is marked approximate to mirror distributed-terms honesty (fixture is exact, but the
 * contract stays honest). Truncation flags come from the true distinct member counts.
 */
export function getFoundationHuntCrosstab(
  request: HuntCrosstabRequest,
  signal?: AbortSignal,
): HuntCrosstabResponse {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const fieldOf = (field: string) => (e: HuntEvent): string | null => {
    switch (field) {
      case 'event.severity': case 'severity': return e.severity;
      case 'dataSource': return e.dataSource;
      case 'data_stream.dataset': case 'dataset': return e.dataset;
      case 'event.action': case 'action': return e.action;
      case 'host.name': case 'host': return e.host;
      case 'user.name': case 'user': return e.user;
      case 'event.category': case 'category': return e.category;
      case 'source.ip': return e.sourceIp;
      case 'destination.ip': return e.destinationIp;
      case 'process.name': return (e.normalized?.['process.name'] as string) ?? null;
      default: return (e.normalized?.[field] as string) ?? null;
    }
  };

  // Bucket an ISO/parseable timestamp down to the fixed interval's start (fixture approximation of a
  // date_histogram). Supports the allow-listed m/h/d intervals; unknown intervals fall back to 1h.
  const intervalMs = (interval: string): number => {
    const match = /^(\d+)([mhd])$/.exec(interval.trim());
    if (!match) return 3_600_000;
    const n = Number(match[1]);
    const unit = match[2] === 'm' ? 60_000 : match[2] === 'h' ? 3_600_000 : 86_400_000;
    return n * unit;
  };
  const bucketStartIso = (e: HuntEvent, interval: string): string | null => {
    const ts = (e.normalized?.['@timestamp'] as string) ?? e.timestamp;
    const ms = ts ? Date.parse(ts) : NaN;
    if (Number.isNaN(ms)) return null;
    const step = intervalMs(interval);
    return new Date(Math.floor(ms / step) * step).toISOString();
  };
  const withBucket = (base: (e: HuntEvent) => string | null, bucket?: { interval: string }) =>
    (bucket ? (e: HuntEvent) => bucketStartIso(e, bucket.interval) : base);

  // (missing) sentinel: mirrors the backend MISSING_SENTINEL so the FE renders it as "(no value)".
  const MISSING_SENTINEL = '\u0000(missing)';
  const withMissing = (accessor: (e: HuntEvent) => string | null, include: boolean) =>
    (include ? (e: HuntEvent) => accessor(e) ?? MISSING_SENTINEL : accessor);

  const rowInclude = request.rowMissing === 'include';
  const colInclude = request.colMissing === 'include';
  const rowOf = withMissing(withBucket(fieldOf(request.rowField), request.rowBucket), rowInclude);
  const colOf = withMissing(withBucket(fieldOf(request.colField), request.colBucket), colInclude);
  const distinctOf = request.valueFn === 'distinct' && request.distinctField
    ? fieldOf(request.distinctField)
    : null;

  const totalMatched = foundationHuntEvents.length;
  // Pivot-eligible = both axis fields present.
  const eligible = foundationHuntEvents.filter((e) => rowOf(e) != null && colOf(e) != null);
  const pivotEligibleMatched = eligible.length;
  const distinct = request.valueFn === 'distinct';

  // Measure of an event set: count of docs, or distinct cardinality of the distinct field.
  const measureOf = (events: HuntEvent[]): number => {
    if (!distinct || !distinctOf) return events.length;
    const set = new Set<string>();
    for (const e of events) {
      const v = distinctOf(e);
      if (v != null) set.add(v);
    }
    return set.size;
  };

  // Group eligible events by row and by col member.
  const byRow = new Map<string, HuntEvent[]>();
  const byCol = new Map<string, HuntEvent[]>();
  const byCell = new Map<string, HuntEvent[]>();
  const push = (map: Map<string, HuntEvent[]>, key: string, e: HuntEvent): void => {
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  };
  for (const e of eligible) {
    const r = rowOf(e) as string;
    const c = colOf(e) as string;
    push(byRow, r, e);
    push(byCol, c, e);
    push(byCell, `${r}\u0000${c}`, e);
  }

  const rowCardinalityEstimate = byRow.size;
  const colCardinalityEstimate = byCol.size;

  // Top-N members by the selected measure (mirrors Stage-A discovery).
  const rankMembers = (groups: Map<string, HuntEvent[]>, size: number): string[] =>
    [...groups.entries()]
      .map(([key, evs]) => [key, measureOf(evs)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, size))
      .map(([key]) => key);

  const rowKeys = rankMembers(byRow, request.rowSize);
  const colKeys = rankMembers(byCol, request.colSize);

  // Cells: only selected row x selected col intersections, non-zero.
  const cells = [] as HuntCrosstabResponse['cells'];
  for (const r of rowKeys) {
    for (const c of colKeys) {
      const evs = byCell.get(`${r}\u0000${c}`);
      if (!evs || evs.length === 0) continue;
      const value = measureOf(evs);
      if (value > 0) cells.push({ row: r, col: c, value });
    }
  }

  // P2 fixture comparison: synthesize a deterministic prior value (~70-115% of current) so the delta
  // renders in fixture mode. Real backend runs an actual shifted-window query.
  if (request.comparison) {
    for (const cell of cells) {
      const seed = (cell.row.length * 7 + cell.col.length * 13) % 45; // 0..44 → 70%..114%
      const prev = Math.round((cell.value * (70 + seed)) / 100);
      cell.comparisonValue = prev;
      cell.delta = cell.value - prev;
      cell.deltaPercent = prev === 0 ? null : Math.round(((cell.value - prev) * 100) / prev);
    }
  }

  // Row/col totals at their OWN scope (full member within eligible; not intersected).
  const rowTotals = rowKeys.map((r) => measureOf(byRow.get(r) ?? []));
  const colTotals = colKeys.map((c) => measureOf(byCol.get(c) ?? []));
  const grandTotal = distinct ? measureOf(eligible) : pivotEligibleMatched;

  const rowTruncated = rowCardinalityEstimate > rowKeys.length;
  const colTruncated = colCardinalityEstimate > colKeys.length;

  const m = (over: string) => (distinct
    ? `approximate distinct(${request.distinctField}) ${over}`
    : `documents ${over}`);

  return {
    searchId: 'HUNT-XT-FIXTURE',
    computedAt: new Date().toISOString(),
    totalMatched,
    pivotEligibleMatched,
    totalRelation: 'eq',
    measure: { function: request.valueFn, field: request.distinctField ?? null, approximate: distinct },
    rowKeys,
    colKeys,
    cells,
    rowTotals,
    colTotals,
    grandTotal,
    totalSemantics: {
      cell: m('matching row AND column member'),
      row: m('matching the row member in pivot-eligible scope'),
      column: m('matching the column member in pivot-eligible scope'),
      grand: m('in the pivot-eligible scope'),
      additive: false,
    },
    rowTruncated,
    colTruncated,
    rowCardinalityEstimate,
    colCardinalityEstimate,
    cardinalityApproximate: true,
    rowBucketed: request.rowBucket != null,
    colBucketed: request.colBucket != null,
    rowBucketInterval: request.rowBucket?.interval ?? null,
    colBucketInterval: request.colBucket?.interval ?? null,
    rowHasMissingBucket: rowInclude,
    colHasMissingBucket: colInclude,
    missingKey: rowInclude || colInclude ? MISSING_SENTINEL : null,
    rowMultiValued: request.rowField === 'event.category',
    colMultiValued: request.colField === 'event.category',
    comparison: request.comparison
      ? { mode: request.comparison.mode ?? 'previous_period', from: '(fixture)', to: '(fixture)' }
      : undefined,
    rowDeviations: request.deviation && request.rowField === 'user.name'
      ? rowKeys.map((k, i) => (i % 2 === 0 ? { metric: 'failed_logon_ratio', zScore: Number((2 + (k.length % 4) + i * 0.3).toFixed(1)) } : null))
      : undefined,
    axisSelection: {
      strategy: 'distributed_terms',
      approximate: true,
      rowShardSize: Math.max(request.rowSize * 4, 200),
      colShardSize: Math.max(request.colSize * 4, 200),
      rowDocCountErrorUpperBound: distinct ? null : 0,
      colDocCountErrorUpperBound: distinct ? null : 0,
    },
    execution: {
      tookMs: 6,
      timedOut: false,
      returnedCells: cells.length,
      returnedRows: rowKeys.length,
      returnedColumns: colKeys.length,
      truncated: rowTruncated || colTruncated,
    },
    status: 'COMPLETE',
    partialFailures: [],
  };
}
