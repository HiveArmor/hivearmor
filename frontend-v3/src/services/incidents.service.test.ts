/**
 * Incidents Service Tests
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('incidents.service', () => {
  it('exports getIncidents function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncidents).toBe('function');
  });

  it('exports getIncident function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncident).toBe('function');
  });

  it('exports createIncident function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.createIncident).toBe('function');
  });

  it('exports addAlertsToIncident function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.addAlertsToIncident).toBe('function');
  });

  it('exports changeIncidentStatus function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.changeIncidentStatus).toBe('function');
  });

  it('exports getIncidentEntityGraph function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncidentEntityGraph).toBe('function');
  });

  it('exports getIncidentEvidence function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncidentEvidence).toBe('function');
  });

  it('exports getIncidentTimeline function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncidentTimeline).toBe('function');
  });

  it('exports getIncidentEntities function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncidentEntities).toBe('function');
  });

  it('exports generateAiSummary function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.generateAiSummary).toBe('function');
  });

  it('exports getUsersAssigned function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getUsersAssigned).toBe('function');
  });

  it('exports getIncidentSlaStats function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.getIncidentSlaStats).toBe('function');
  });

  it('unwraps OpenSearch evidence envelope { items, total }', async () => {
    const { getIncidentEvidence } = await import('./incidents.service');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 'ev-1', title: 'Artifact', type: 'note', source: 'analyst', timestamp: '2026-08-23T10:00:00Z', content: '', addedBy: 'a', addedAt: '2026-08-23T10:00:00Z' }],
      total: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const items = await getIncidentEvidence(12);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('ev-1');
  });
});

describe('normalizeIncidentSlaStats', () => {
  it('normalizes backend sla-stats map fields', async () => {
    const { normalizeIncidentSlaStats } = await import('./incidents.service');
    expect(normalizeIncidentSlaStats({ total: 40, breached: 7, compliant: 33 })).toEqual({
      total: 40,
      breached: 7,
      compliant: 33,
    });
  });

  it('derives compliant when omitted', async () => {
    const { normalizeIncidentSlaStats } = await import('./incidents.service');
    expect(normalizeIncidentSlaStats({ total: 10, breached: 3 })).toEqual({
      total: 10,
      breached: 3,
      compliant: 7,
    });
  });

  it('coerces invalid and negative values to zero', async () => {
    const { normalizeIncidentSlaStats } = await import('./incidents.service');
    expect(normalizeIncidentSlaStats({ total: '12', breached: -2, compliant: 'bad' })).toEqual({
      total: 12,
      breached: 0,
      compliant: 0,
    });
    expect(normalizeIncidentSlaStats(null)).toEqual({ total: 0, breached: 0, compliant: 0 });
  });
});

describe('slaCompliancePercent / formatSlaStatsDetail', () => {
  it('returns null rate when total is zero', async () => {
    const { slaCompliancePercent, formatSlaStatsDetail } = await import('./incidents.service');
    expect(slaCompliancePercent({ total: 0, breached: 0, compliant: 0 })).toBeNull();
    expect(formatSlaStatsDetail({ total: 0, breached: 0, compliant: 0 })).toBe('no incidents tracked');
  });

  it('formats compliance subtitle for summary tiles', async () => {
    const { slaCompliancePercent, formatSlaStatsDetail } = await import('./incidents.service');
    const stats = { total: 40, breached: 7, compliant: 33 };
    expect(slaCompliancePercent(stats)).toBe(83);
    expect(formatSlaStatsDetail(stats)).toBe('33 compliant · 83% · 40 tracked');
  });
});

describe('getIncidentSlaStats', () => {
  it('fetches /api/ha-incidents/sla-stats and normalizes the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 25, breached: 5, compliant: 20 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    const { getIncidentSlaStats } = await import('./incidents.service');
    const stats = await getIncidentSlaStats();

    expect(stats).toEqual({ total: 25, breached: 5, compliant: 20 });
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/ha-incidents/sla-stats');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');

    localStorage.removeItem('hivearmor_auth_token');
  });
});
