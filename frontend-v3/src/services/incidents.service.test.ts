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
