import { describe, it, expect } from 'vitest';

import { pivotFieldToEntityType } from './pivotEntityType';

describe('pivotFieldToEntityType', () => {
  it('maps known entity fields to the backend entity types', () => {
    expect(pivotFieldToEntityType('user.name')).toBe('user');
    expect(pivotFieldToEntityType('host.name')).toBe('host');
    expect(pivotFieldToEntityType('source.ip')).toBe('ip');
    expect(pivotFieldToEntityType('destination.ip')).toBe('ip');
    expect(pivotFieldToEntityType('process.name')).toBe('process');
  });

  it('returns null for a non-entity field (the graph action then does not offer itself)', () => {
    expect(pivotFieldToEntityType('event.action')).toBeNull();
    expect(pivotFieldToEntityType('event.category')).toBeNull();
  });
});
