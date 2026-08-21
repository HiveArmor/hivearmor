import { describe, expect, it } from 'vitest';

import { entityTypeLabel, normalizeEntityIconType } from './entityType';

describe('shared entity type semantics', () => {
  it.each([
    ['device', 'host'], ['endpoint', 'host'], ['identity', 'user'], ['account', 'user'],
    ['ip_address', 'ip'], ['application', 'service'], ['cloud-resource', 'cloud'], ['url', 'domain'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeEntityIconType(input)).toBe(expected);
  });

  it('uses accessible display labels with a safe unknown fallback', () => {
    expect(entityTypeLabel('ip')).toBe('IP address');
    expect(entityTypeLabel('service')).toBe('Service');
    expect(entityTypeLabel('custom_resource')).toBe('custom_resource');
    expect(entityTypeLabel(undefined)).toBe('Unknown entity');
  });
});
