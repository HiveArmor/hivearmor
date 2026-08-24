/**
 * Investigation session service — case task API contracts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInvestigationTask,
  deleteInvestigationTask,
  fetchInvestigationTasks,
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
