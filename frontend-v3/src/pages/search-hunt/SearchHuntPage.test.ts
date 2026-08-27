/**
 * SearchHuntPage — identity + contract scan (Prompt 10)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { SearchExecuteRequest, SearchExecuteResponse } from './searchHunt.types';

describe('SearchHunt identity', () => {
  it('states ad-hoc hunt job and sibling cross-links', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/search-hunt/SearchHuntPage.tsx'), 'utf8');
    expect(source).toContain('SEARCH_HUNT_JOB_SENTENCE');
    expect(source.toLowerCase()).toMatch(/ad-hoc hunt|event search/);
    expect(source).toContain('to="/dashboard"');
    expect(source).toContain('to="/alerts"');
    expect(source).toContain('to="/investigations"');
    expect(source).toContain('to="/incidents"');
    expect(source).toContain('runNlQuery');
    expect(source).toContain('useConfirmedSavedQueries');
    expect(source).not.toContain('eps={searchHuntFixtureMode ? 12840');
    expect(source).toContain('Histogram unavailable until the search response includes time buckets');
  });

  it('wires confirmed saved-query service paths', () => {
    const service = readFileSync(join(process.cwd(), 'src/services/search.service.ts'), 'utf8');
    expect(service).toContain('/ha-search/nl-query');
    expect(service).toContain('/ha-saved-queries');
    expect(service).toContain('question:');
    expect(service).not.toContain('/ha-search/execute');
  });
});

describe('SearchHunt Types', () => {
  it('should validate SearchExecuteRequest shape', () => {
    const request: SearchExecuteRequest = {
      query: 'event.action:login',
      timeRange: { type: 'preset', preset: '1h' },
      from: 0,
      size: 50,
    };

    expect(request.query).toBe('event.action:login');
    expect(request.from).toBe(0);
    expect(request.size).toBe(50);
  });

  it('should validate SearchExecuteResponse shape', () => {
    const response: SearchExecuteResponse = {
      hits: [
        {
          '@timestamp': '2026-07-23T12:00:00Z',
          'event.severity': 2,
          'source.ip': '10.0.0.1',
          message: 'Test event',
        },
      ],
      total: 1,
      took: 42,
      histogram: [
        {
          timestamp: '2026-07-23T12:00:00Z',
          count: 1,
        },
      ],
    };

    expect(response.hits.length).toBe(1);
    expect(response.total).toBe(1);
    expect(response.histogram.length).toBe(1);
  });

  it('should allow arbitrary fields in EventDTO', () => {
    const response: SearchExecuteResponse = {
      hits: [
        {
          '@timestamp': '2026-07-23T12:00:00Z',
          'custom.field': 'arbitrary value',
        },
      ],
      total: 1,
      took: 10,
      histogram: [],
    };

    expect(response.hits[0]['custom.field']).toBe('arbitrary value');
  });
});

describe('SearchHunt Utils', () => {
  it('should categorize event fields correctly', () => {
    const fieldNames = [
      'event.category',
      'source.ip',
      'destination.ip',
      'user.name',
      'process.name',
      'custom.field',
    ];

    const categorize = (name: string) => {
      if (name.startsWith('event.')) return 'event';
      if (name.startsWith('source.')) return 'source';
      if (name.startsWith('destination.') || name.startsWith('network.')) return 'network';
      if (name.startsWith('user.')) return 'user';
      if (name.startsWith('process.')) return 'process';
      return 'other';
    };

    expect(categorize(fieldNames[0])).toBe('event');
    expect(categorize(fieldNames[1])).toBe('source');
    expect(categorize(fieldNames[2])).toBe('network');
    expect(categorize(fieldNames[3])).toBe('user');
    expect(categorize(fieldNames[4])).toBe('process');
    expect(categorize(fieldNames[5])).toBe('other');
  });
});
