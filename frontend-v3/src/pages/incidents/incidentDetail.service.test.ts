/**
 * Incident detail service — live /api/ha-incidents* mutation contracts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  changeIncidentStatus,
  createEvidenceItem,
  mapIncidentStatusToApi,
  updateEvidenceItem,
  updateIncidentDetail,
} from './incidentDetail.service';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.removeItem('hivearmor_auth_token');
});

describe('mapIncidentStatusToApi', () => {
  it('maps UI statuses to IncidentStatusEnum names used by change-status', () => {
    expect(mapIncidentStatusToApi('open')).toBe('OPEN');
    expect(mapIncidentStatusToApi('in_progress')).toBe('IN_REVIEW');
    expect(mapIncidentStatusToApi('resolved')).toBe('COMPLETED');
    expect(mapIncidentStatusToApi('closed')).toBe('MERGED');
  });
});

describe('changeIncidentStatus', () => {
  it('PUTs /api/ha-incidents/change-status with incidentStatus enum name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    await changeIncidentStatus(42, 'resolved');

    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/change-status', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ id: 42, incidentStatus: 'COMPLETED' }),
    }));
  });

  it('sends MERGED when closing an incident', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await changeIncidentStatus(7, 'closed');

    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/change-status', expect.objectContaining({
      body: JSON.stringify({ id: 7, incidentStatus: 'MERGED' }),
    }));
  });
});

describe('updateIncidentDetail', () => {
  it('wires priority through PUT /ha-incidents/{id}/priority', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await updateIncidentDetail(15, { incidentPriority: 'P1' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/15/priority', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ priority: 'P1' }),
    }));
  });

  it('wires status and priority in one call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await updateIncidentDetail(3, { incidentStatus: 'in_progress', incidentPriority: 'P2' });

    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/change-status', expect.objectContaining({
      body: JSON.stringify({ id: 3, incidentStatus: 'IN_REVIEW' }),
    }));
    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/3/priority', expect.objectContaining({
      body: JSON.stringify({ priority: 'P2' }),
    }));
  });

  it('throws for metadata fields that require patchIncident + If-Match', async () => {
    await expect(
      updateIncidentDetail(1, { incidentName: 'Renamed' })
    ).rejects.toThrow(/patchIncident/);
  });
});

describe('evidence item mutations', () => {
  it('POSTs create with numeric severityHint and normalizes the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 9,
          incidentId: 1,
          itemType: 'NOTE',
          title: 'Note',
          content: 'body',
          sourceRef: null,
          severityHint: 9,
          createdBy: 'analyst',
          createdAt: '2026-08-23T10:00:00Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const created = await createEvidenceItem({
      incidentId: 1,
      itemType: 'NOTE',
      title: 'Note',
      content: 'body',
      severityHint: 'critical',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/1/evidence-items', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        itemType: 'NOTE',
        title: 'Note',
        content: 'body',
        severityHint: 9,
      }),
    }));
    expect(created.severityHint).toBe('critical');
  });

  it('PUTs updateEvidenceItem to /evidence-items/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 9,
          incidentId: 1,
          itemType: 'ARTIFACT',
          title: 'Updated',
          content: null,
          sourceRef: 'hash:abc',
          severityHint: 7,
          createdBy: 'analyst',
          createdAt: '2026-08-23T10:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const updated = await updateEvidenceItem(1, 9, {
      title: 'Updated',
      sourceRef: 'hash:abc',
      severityHint: 'high',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/ha-incidents/1/evidence-items/9', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        title: 'Updated',
        sourceRef: 'hash:abc',
        severityHint: 7,
      }),
    }));
    expect(updated.severityHint).toBe('high');
    expect(updated.title).toBe('Updated');
  });
});
