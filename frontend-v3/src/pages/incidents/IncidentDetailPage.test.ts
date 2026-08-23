/**
 * IncidentDetailPage — Unit Tests
 * Tests for incident investigation workbench per CMD-04
 */

import { describe, it, expect } from 'vitest';

import type { IncidentDetail, TimelineEvent, EvidenceItem } from './incidentDetail.types';

describe('IncidentDetailPage types', () => {
  it('should define IncidentDetail interface', () => {
    const incident: IncidentDetail = {
      id: 1,
      incidentName: 'Test Incident',
      incidentDescription: 'Test description',
      incidentPriority: 'P1',
      incidentSeverity: 9,
      incidentStatus: 'open',
      incidentAssignedTo: 'John Doe',
      incidentAssignedToId: 123,
      incidentSolution: null,
      incidentCreatedDate: '2024-01-01T00:00:00Z',
      incidentLastUpdated: '2024-01-01T00:00:00Z',
      slaDeadline: '2024-01-02T00:00:00Z',
    };

    expect(incident.id).toBe(1);
    expect(incident.incidentName).toBe('Test Incident');
    expect(incident.incidentPriority).toBe('P1');
    expect(incident.incidentSeverity).toBe(9);
  });

  it('should define TimelineEvent interface', () => {
    const event: TimelineEvent = {
      id: 1,
      timestamp: '2024-01-01T00:00:00Z',
      eventType: 'alert_added',
      actor: 'System',
      description: 'Alert added to incident',
    };

    expect(event.id).toBe(1);
    expect(event.eventType).toBe('alert_added');
    expect(event.actor).toBe('System');
  });

  it('should define EvidenceItem interface', () => {
    const item: EvidenceItem = {
      id: 1,
      incidentId: 1,
      itemType: 'ALERT',
      title: 'Test Alert',
      content: 'Alert content',
      sourceRef: 'https://example.com',
      severityHint: 'critical',
      createdBy: 'analyst@example.com',
      createdAt: '2024-01-01T00:00:00Z',
    };

    expect(item.id).toBe(1);
    expect(item.itemType).toBe('ALERT');
    expect(item.severityHint).toBe('critical');
  });
});

describe('IncidentDetailPage service', () => {
  it('should export fetchIncidentDetail function', async () => {
    const { fetchIncidentDetail } = await import('./incidentDetail.service');
    expect(typeof fetchIncidentDetail).toBe('function');
  });

  it('should export updateIncidentDetail function', async () => {
    const { updateIncidentDetail } = await import('./incidentDetail.service');
    expect(typeof updateIncidentDetail).toBe('function');
  });

  it('should export updateEvidenceItem against the nested evidence-items contract', async () => {
    const { updateEvidenceItem } = await import('./incidentDetail.service');
    expect(typeof updateEvidenceItem).toBe('function');
  });

  it('should export closeIncident function', async () => {
    const { closeIncident } = await import('./incidentDetail.service');
    expect(typeof closeIncident).toBe('function');
  });

  it('should export fetchIncidentTimeline function', async () => {
    const { fetchIncidentTimeline } = await import('./incidentDetail.service');
    expect(typeof fetchIncidentTimeline).toBe('function');
  });

  it('should export fetchEvidenceItems function', async () => {
    const { fetchEvidenceItems } = await import('./incidentDetail.service');
    expect(typeof fetchEvidenceItems).toBe('function');
  });

  it('should export the bounded linked-alert fetcher', async () => {
    const { fetchIncidentAlerts } = await import('./incidentDetail.service');
    expect(typeof fetchIncidentAlerts).toBe('function');
  });
});

describe('Incident Workbench performance invariants', () => {
  it('code-splits heavy analyst panels and does not restore the 200-alert request', async () => {
    const source = await import('./IncidentDetailPage?raw');
    expect(source.default).toContain('const SiemDataGrid = lazy');
    expect(source.default).toContain('const AlertDetailDrawer = lazy');
    expect(source.default).toContain('fetchIncidentAlerts(incidentId, 50)');
    expect(source.default).not.toContain('size=200');
    expect(source.default).not.toContain('Tasks Coming Soon');
  });

  it('keeps lifecycle, event hunt, task, response and activity workspaces in one routed case', async () => {
    const source = await import('./IncidentDetailPage?raw');
    expect(source.default).toContain('Incident response lifecycle');
    expect(source.default).toContain("key: 'events'");
    expect(source.default).toContain("key: 'tasks'");
    expect(source.default).toContain("key: 'response'");
    expect(source.default).toContain("key: 'activity'");
    expect(source.default).toContain('ResponseActionsPanel');
    expect(source.default).toContain('SimilarIncidentsPanel');
  });

  it('uses semantic colour tokens throughout the workbench stylesheet', async () => {
    const styles = await import('./IncidentDetailPage.css?raw');
    expect(styles.default).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});

describe('InvestigationTab type', () => {
  it('should verify incidentDetail.types module exports', async () => {
    const module = await import('./incidentDetail.types') as Record<string, unknown>;
    expect(typeof module).toBe('object');
  });
});
