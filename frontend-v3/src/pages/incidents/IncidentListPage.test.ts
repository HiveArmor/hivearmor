/**
 * IncidentListPage Tests — Prompt 09 owned response cases
 */

import { describe, it, expect } from 'vitest';

describe('IncidentListPage', () => {
  it('exports IncidentListPage function', async () => {
    const module = await import('./IncidentListPage');
    expect(typeof module.IncidentListPage).toBe('function');
  });

  it('exports owned-case job sentence distinct from queue/alerts/findings', async () => {
    const { INCIDENTS_JOB_SENTENCE } = await import('./IncidentListPage');
    expect(INCIDENTS_JOB_SENTENCE).toContain('owned response cases');
    expect(INCIDENTS_JOB_SENTENCE.toLowerCase()).toContain('sla');
    expect(INCIDENTS_JOB_SENTENCE.toLowerCase()).toContain('assignment');

    const source = await import('./IncidentListPage?raw');
    expect(source.default).toContain('INCIDENTS_JOB_SENTENCE');
    expect(source.default).toContain('Mission Control');
    expect(source.default).toContain('/correlated-findings');
    expect(source.default).toContain('/queue');
    expect(source.default).toContain('/alerts');
    expect(source.default).not.toContain('Incident Command');
    expect(source.default).toContain('Required permission:');
  });
});

describe('incidents.types', () => {
  it('exports IncidentListItem interface', async () => {
    const module = await import('./incidents.types') as Record<string, unknown>;
    expect(typeof module).toBe('object');
  });
});

describe('incidents.service', () => {
  it('exports fetchIncidents function', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.fetchIncidents).toBe('function');
  });

  it('exports the bounded queue summary adapter', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.fetchIncidentQueueSummary).toBe('function');
  });

  it('exports filtersToParams helper', async () => {
    const module = await import('./incidents.service');
    expect(typeof module.filtersToParams).toBe('function');
  });
});

describe('columnDefs', () => {
  it('exports INCIDENT_COLUMN_DEFS array', async () => {
    const module = await import('./columnDefs');
    expect(Array.isArray(module.INCIDENT_COLUMN_DEFS)).toBe(true);
  });

  it('wires SlaIndicator through the SLA column renderer', async () => {
    const { INCIDENT_COLUMN_DEFS } = await import('./columnDefs');
    const slaCol = INCIDENT_COLUMN_DEFS.find((col) => col.field === 'slaDeadline');
    expect(slaCol?.headerName).toBe('SLA');
    expect(slaCol?.cellRenderer).toBeDefined();

    const rendererSrc = await import('./renderers/SlaDeadlineRenderer?raw');
    expect(rendererSrc.default).toContain("from '@/components/sla-indicator/SlaIndicator'");
    expect(rendererSrc.default).toContain('<SlaIndicator');
  });
});
