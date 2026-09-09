/**
 * Item C (relationship graph) — map a pivot axis field to the entity type the existing entity-graph endpoint
 * ({@code /api/ha-entities/{entityType}/{entityId}/graph}) understands. Returns null for a field that is not
 * a graphable entity, so the "View entity graph" action only offers itself when it can actually resolve.
 *
 * Backend valid entity types: ip | host | user | process.
 */
export function pivotFieldToEntityType(field: string): 'ip' | 'host' | 'user' | 'process' | null {
  const f = field.toLowerCase();
  if (f === 'user.name' || f.endsWith('.user') || f === 'user') return 'user';
  if (f === 'host.name' || f.endsWith('.host') || f === 'host') return 'host';
  if (f.endsWith('.ip') || f === 'ip' || f === 'source.ip' || f === 'destination.ip') return 'ip';
  if (f === 'process.name' || f.endsWith('.process') || f === 'process') return 'process';
  return null;
}
