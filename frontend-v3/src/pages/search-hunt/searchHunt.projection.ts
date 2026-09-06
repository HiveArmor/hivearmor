/** Maps canonical backend fields to the result-grid column identifiers. */
export const HUNT_FIELD_COLUMN_MAP: Readonly<Record<string, string>> = {
  '@timestamp': 'timestamp',
  'event.severity': 'severity',
  'event.category': 'category',
  'event.action': 'action',
  'host.name': 'host',
  'user.name': 'user',
  'source.ip': 'sourceIp',
  'destination.ip': 'destinationIp',
  'data_stream.dataset': 'dataset',
};

/** Convert visible grid columns into the bounded canonical projection accepted by Search & Hunt. */
export function huntColumnsToProjection(columnIds: readonly string[]): string[] {
  const fields = Object.entries(HUNT_FIELD_COLUMN_MAP)
    .filter(([, columnId]) => columnIds.includes(columnId))
    .map(([fieldName]) => fieldName);
  // The opt-in "Relative time" column renders from @timestamp — guarantee it is projected even if
  // the absolute "Event time" column is hidden.
  if (columnIds.includes('relativeTime') && !fields.includes('@timestamp')) fields.push('@timestamp');
  return fields;
}

const COLUMN_TO_SORT_FIELD: Readonly<Record<string, string>> = {
  timestamp: '@timestamp',
  relativeTime: '@timestamp',
  severity: 'event.severity',
  category: 'event.category',
  action: 'event.action',
  host: 'host.name',
  user: 'user.name',
  sourceIp: 'source.ip',
  destinationIp: 'destination.ip',
  dataset: 'data_stream.dataset',
  message: 'message',
  dataSource: 'data_stream.type',
  alertCount: 'hivearmor.alert_count',
};

/** Map a grid column id to an OpenSearch sort field (falls back to column id). */
export function huntColumnToSortField(columnId: string): string {
  return COLUMN_TO_SORT_FIELD[columnId] ?? columnId;
}
