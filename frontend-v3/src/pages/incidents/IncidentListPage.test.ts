/**
 * IncidentListPage Tests
 */

import { describe, it, expect } from 'vitest';

describe('IncidentListPage', () => {
  it('exports IncidentListPage function', async () => {
    const module = await import('./IncidentListPage');
    expect(typeof module.IncidentListPage).toBe('function');
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
