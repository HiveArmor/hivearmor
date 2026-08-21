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
  return Object.entries(HUNT_FIELD_COLUMN_MAP)
    .filter(([, columnId]) => columnIds.includes(columnId))
    .map(([fieldName]) => fieldName);
}
