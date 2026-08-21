import { describe, expect, it } from 'vitest';

import { executeFoundationHunt, getFoundationHuntFieldValues } from './searchHunt.fixtures';
import type { HuntSearchRequest } from './searchHunt.types';

const request: HuntSearchRequest = {
  query: 'event.category:*',
  language: 'kql',
  timeRange: {
    from: '2026-08-03T00:00:00.000Z',
    to: '2026-08-03T08:00:00.000Z',
  },
  tenantScope: 'authorized',
  fields: ['@timestamp', 'event.category'],
  cursor: null,
  limit: 100,
  sort: [
    { field: '@timestamp', direction: 'desc' },
    { field: '_id', direction: 'asc' },
  ],
  includeHistogram: true,
};

describe('Search & Hunt cursor fixtures', () => {
  it('returns bounded, stable, non-overlapping cursor pages', async () => {
    const first = await executeFoundationHunt(request);
    const second = await executeFoundationHunt({
      ...request,
      cursor: first.nextCursor,
      includeHistogram: false,
    });

    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toBe('fixture-100');
    expect(first.histogram).toHaveLength(24);
    expect(second.items).toHaveLength(100);
    expect(second.histogram).toHaveLength(0);
    expect(second.searchId).toBe(first.searchId);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(new Set([...first.items, ...second.items].map((event) => event.id)).size).toBe(200);
  });

  it('paginates high-cardinality field values with safe server-authored pivots', async () => {
    const first = await getFoundationHuntFieldValues('HUNT-FIXTURE', 'source.ip', null, '');
    const second = await getFoundationHuntFieldValues('HUNT-FIXTURE', 'source.ip', first.nextCursor, '');

    expect(first.items).toHaveLength(10);
    expect(first.totalDistinctApproximate).toBeGreaterThan(10);
    expect(first.nextCursor).toBe('field-fixture-10');
    expect(second.items[0].value).not.toBe(first.items[0].value);
    expect(first.items[0].includeQuery).toBe(`source.ip:${first.items[0].value}`);
    expect(first.items[0].excludeQuery).toBe(`source.ip!=${first.items[0].value}`);
  });

  it('searches values inside the authorized result snapshot', async () => {
    const values = await getFoundationHuntFieldValues('HUNT-FIXTURE', 'source.ip', null, '203.0.113');

    expect(values.items).toHaveLength(1);
    expect(values.items[0].value).toBe('203.0.113.17');
    expect(values.totalDistinctApproximate).toBe(1);
  });
});
