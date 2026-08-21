import { describe, expect, it } from 'vitest';

import { huntColumnsToProjection } from './searchHunt.projection';

describe('huntColumnsToProjection', () => {
  it('converts grid aliases to canonical backend fields and omits display-only columns', () => {
    expect(huntColumnsToProjection([
      'timestamp', 'severity', 'dataSource', 'action', 'host', 'user', 'sourceIp', 'message', 'alertCount',
    ])).toEqual([
      '@timestamp', 'event.severity', 'event.action', 'host.name', 'user.name', 'source.ip',
    ]);
  });
});
