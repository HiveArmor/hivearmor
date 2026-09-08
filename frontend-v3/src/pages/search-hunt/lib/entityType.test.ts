import { describe, expect, it } from 'vitest';

import { buildEntityId, resolveEntityType, timelineAvailable } from './entityType';

describe('resolveEntityType', () => {
  it('resolves common ECS entity fields', () => {
    expect(resolveEntityType('user.name')).toBe('user');
    expect(resolveEntityType('host.name')).toBe('host');
    expect(resolveEntityType('source.ip')).toBe('ip');
    expect(resolveEntityType('destination.ip')).toBe('ip');
    expect(resolveEntityType('process.name')).toBe('process');
    expect(resolveEntityType('file.name')).toBe('file');
    expect(resolveEntityType('file.hash.sha256')).toBe('file');
    expect(resolveEntityType('url.domain')).toBe('domain');
  });

  it('is case-insensitive and trims', () => {
    expect(resolveEntityType('  HOST.NAME ')).toBe('host');
    expect(resolveEntityType('Source.IP')).toBe('ip');
  });

  it('returns null for non-entity fields (never guesses)', () => {
    expect(resolveEntityType('event.action')).toBeNull();
    expect(resolveEntityType('event.severity')).toBeNull();
    expect(resolveEntityType('data_stream.dataset')).toBeNull();
    expect(resolveEntityType('')).toBeNull();
  });
});

describe('buildEntityId', () => {
  it('builds the "<type>:<value>" id the dossier route expects', () => {
    expect(buildEntityId('ip', '10.0.1.45')).toBe('ip:10.0.1.45');
    expect(buildEntityId('user', 'alice')).toBe('user:alice');
  });
});

describe('timelineAvailable', () => {
  it('is true only for user fields (endpoint is userId-scoped today)', () => {
    expect(timelineAvailable('user.name')).toBe(true);
    expect(timelineAvailable('host.name')).toBe(false);
    expect(timelineAvailable('source.ip')).toBe(false);
    expect(timelineAvailable('event.action')).toBe(false);
  });
});
