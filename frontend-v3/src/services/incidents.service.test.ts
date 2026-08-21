/**
 * Incidents Service Tests
 */

import { describe, it, expect } from 'vitest';

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
});
