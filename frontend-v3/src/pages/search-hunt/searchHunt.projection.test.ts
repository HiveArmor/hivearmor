import { describe, expect, it } from 'vitest';

import { huntColumnToSortField, huntColumnsToProjection } from './searchHunt.projection';

describe('huntColumnsToProjection', () => {
  it('converts grid aliases to canonical backend fields and omits display-only columns', () => {
    expect(huntColumnsToProjection([
      'timestamp', 'severity', 'dataSource', 'action', 'host', 'user', 'sourceIp', 'message', 'alertCount',
    ])).toEqual([
      '@timestamp', 'event.severity', 'event.action', 'host.name', 'user.name', 'source.ip',
    ]);
  });
});

describe('huntColumnToSortField', () => {
  it('maps grid column ids to canonical OpenSearch sort fields', () => {
    expect(huntColumnToSortField('timestamp')).toBe('@timestamp');
    expect(huntColumnToSortField('host')).toBe('host.name');
    expect(huntColumnToSortField('customField')).toBe('customField');
  });
});
