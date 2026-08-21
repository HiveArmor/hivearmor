export type CanonicalEntityIconType =
  | 'host' | 'user' | 'ip' | 'service' | 'process' | 'cloud'
  | 'domain' | 'network' | 'file' | 'artifact' | 'unknown';

export function normalizeEntityIconType(type: string | null | undefined): CanonicalEntityIconType {
  const normalized = type?.toLocaleLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'host' || normalized === 'device' || normalized === 'endpoint' || normalized === 'asset') return 'host';
  if (normalized === 'user' || normalized === 'identity' || normalized === 'account') return 'user';
  if (normalized === 'ip' || normalized === 'ipaddress') return 'ip';
  if (normalized === 'service' || normalized === 'application' || normalized === 'app') return 'service';
  if (normalized === 'process') return 'process';
  if (normalized === 'cloud' || normalized === 'cloudresource') return 'cloud';
  if (normalized === 'domain' || normalized === 'url') return 'domain';
  if (normalized === 'network' || normalized === 'subnet') return 'network';
  if (normalized === 'file') return 'file';
  if (normalized === 'artifact') return 'artifact';
  return 'unknown';
}

export function entityTypeLabel(type: string | null | undefined): string {
  const normalized = normalizeEntityIconType(type);
  if (normalized === 'ip') return 'IP address';
  if (normalized === 'unknown') return type?.trim() || 'Unknown entity';
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}
