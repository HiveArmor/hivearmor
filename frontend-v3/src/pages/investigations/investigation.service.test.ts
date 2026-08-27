/**
 * Investigation session service — case task API contracts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInvestigationTask,
  deleteInvestigationTask,
  fetchInvestigationTasks,
  pinInvestigationItem,
  previewInvestigationPromotion,
  promoteInvestigationToIncident,
  unpinInvestigationItem,
  updateInvestigationTask,
} from './investigation.service';
import type { InvestigationSessionTask } from './investigation.types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.removeItem('hivearmor_auth_token');
});

const sampleTask: InvestigationSessionTask = {
  id: 7,
  sessionId: 42,
  title: 'Collect process tree',
  status: 'OPEN',
  assignee: null,
  externalTicketUrl: 'https://jira.example.com/browse/SEC-1',
  createdBy: 'analyst1',
  createdAt: '2026-08-24T10:00:00Z',
  updatedAt: '2026-08-24T10:00:00Z',
};

describe('investigation session tasks', () => {
  it('GETs /api/ha-investigation-sessions/{id}/tasks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([sampleTask]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    const tasks = await fetchInvestigationTasks(42);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/tasks',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].externalTicketUrl).toBe('https://jira.example.com/browse/SEC-1');
  });

  it('POSTs create with OPEN status and optional ticket URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...sampleTask, id: 9 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createInvestigationTask(42, {
      title: 'Collect process tree',
      externalTicketUrl: 'https://jira.example.com/browse/SEC-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          id: null,
          sessionId: 42,
          title: 'Collect process tree',
          status: 'OPEN',
          assignee: null,
          externalTicketUrl: 'https://jira.example.com/browse/SEC-1',
          createdBy: null,
          createdAt: null,
          updatedAt: null,
        }),
      }),
    );
  });

  it('PUTs status toggle on /tasks/{taskId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...sampleTask, status: 'DONE' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updateInvestigationTask(42, 7, sampleTask, { status: 'DONE' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/tasks/7',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          id: 7,
          sessionId: 42,
          title: 'Collect process tree',
          status: 'DONE',
          assignee: null,
          externalTicketUrl: 'https://jira.example.com/browse/SEC-1',
          createdBy: 'analyst1',
          createdAt: '2026-08-24T10:00:00Z',
          updatedAt: '2026-08-24T10:00:00Z',
        }),
      }),
    );
  });

  it('DELETEs /api/ha-investigation-sessions/{id}/tasks/{taskId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteInvestigationTask(42, 7);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/tasks/7',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('investigation session items + INV-012 promote', () => {
  it('POSTs pin to /items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1,
          sessionId: 42,
          itemType: 'NOTE',
          itemRef: 'note-1',
          itemSnapshot: null,
          note: 'obs',
          addedBy: 'admin',
          addedAt: '2026-08-27T10:00:00Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    await pinInvestigationItem(42, { itemType: 'NOTE', itemRef: 'note-1', note: 'obs' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/items',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('DELETEs unpin /items/{itemId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await unpinInvestigationItem(42, 9);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/items/9',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('POSTs promotion-preview then promote with previewToken + expectedVersion + reason', async () => {
    const preview = {
      sessionId: 42,
      sessionVersion: 3,
      incidentSummary: {
        title: 't',
        descriptionExcerpt: 'd',
        recommendedSeverity: 2,
        recommendedPriority: 'P3',
        severityReasons: ['r'],
        assignee: null,
        targetTenantId: null,
      },
      eligibleEvidence: { totalArtifacts: 1, alertCount: 0, entityCount: 0, eventCount: 0, otherCount: 1 },
      duplicateOrSimilarIncidents: [],
      policyGates: [],
      missingPrerequisites: [],
      warnings: [],
      blastRadius: {
        createsIncident: true,
        marksSessionConverted: true,
        linksSessionIncidentId: true,
        doesNotAutoLinkOpenSearchAlertsYet: true,
      },
      previewToken: 'tok-abc',
      expiresInSeconds: 300,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ incidentId: 99, sessionId: 42, status: 'created' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    const got = await previewInvestigationPromotion(42);
    expect(got.previewToken).toBe('tok-abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/promotion-preview',
      expect.objectContaining({ method: 'POST' }),
    );

    await promoteInvestigationToIncident(42, {
      previewToken: 'tok-abc',
      expectedVersion: 3,
      reason: 'Confirmed malicious lateral movement',
      idempotencyKey: 'fixed-key',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-investigation-sessions/42/promote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          previewToken: 'tok-abc',
          expectedVersion: 3,
          reason: 'Confirmed malicious lateral movement',
          idempotencyKey: 'fixed-key',
        }),
      }),
    );
  });
});
