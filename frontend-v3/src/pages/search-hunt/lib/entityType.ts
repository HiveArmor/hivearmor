/**
 * Field → entity-type resolution for the Pivot cell menu (P1.1).
 *
 * <p>The investigation cell actions (View entity / Open timeline) only make sense when a pivot axis
 * field names an entity. This pure helper maps a field name to one of the backend's entity types
 * (user | host | ip | process | file | domain — the same set accepted by
 * {@code AddEntityRequest.entityType}) and builds the {@code "<type>:<value>"} entity id the
 * dossier route expects. It NEVER guesses: an unrecognised field returns null, and the menu hides
 * the action rather than offering a broken link.
 */

/** Backend-accepted entity types (mirrors AddEntityRequest / ValidEntityType). */
export type PivotEntityType = 'user' | 'host' | 'ip' | 'process' | 'file' | 'domain';

/**
 * Resolve a pivot axis field name to an entity type, or null when the field is not an entity.
 * Case-insensitive; matches on the field's leaf/segment semantics rather than an exact allow-list
 * so ECS-style variants (source.ip, destination.ip, host.name, user.name, ...) resolve too.
 */
export function resolveEntityType(field: string): PivotEntityType | null {
  const f = field.trim().toLowerCase();
  if (!f) return null;

  // IP: any *.ip / ip.* / bare ip field.
  if (f === 'ip' || f.endsWith('.ip') || f.includes('.ip.') || f.startsWith('ip.')) return 'ip';

  // User.
  if (f === 'user.name' || f === 'user' || f.endsWith('.user.name') || f === 'username' || f === 'user.id') return 'user';

  // Host.
  if (f === 'host.name' || f === 'host' || f === 'hostname' || f.endsWith('.host.name') || f === 'host.hostname') return 'host';

  // Process.
  if (f === 'process.name' || f === 'process' || f.endsWith('.process.name') || f === 'process.executable') return 'process';

  // File (name or hash).
  if (f === 'file.name' || f === 'file' || f.endsWith('.file.name') || f.startsWith('file.hash') || f.includes('.hash')) return 'file';

  // Domain.
  if (f === 'domain' || f === 'dns.question.name' || f.endsWith('.domain') || f === 'url.domain') return 'domain';

  return null;
}

/**
 * Build the {@code "<type>:<value>"} entity id used by the dossier route
 * ({@code /entities/{encodeURIComponent(id)}/dossier}) and by AddEntityRequest.
 */
export function buildEntityId(type: PivotEntityType, value: string): string {
  return `${type}:${value}`;
}

/**
 * Whether the UEBA entity-timeline is available for a field. The endpoint
 * ({@code GET /api/ha-ueba/entity-timeline?userId=...}) is user-scoped today, so timeline is
 * offered only for user fields. Flip this once the endpoint accepts host ids.
 */
export function timelineAvailable(field: string): boolean {
  return resolveEntityType(field) === 'user';
}
