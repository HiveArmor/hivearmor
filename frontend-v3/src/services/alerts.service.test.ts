/**
 * Alerts Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
const get = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

describe('alerts.service', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    post.mockResolvedValue(undefined);
  });

  it('posts status with alertIds and numeric status', async () => {
    const { updateAlertStatus } = await import('./alerts.service');
    await updateAlertStatus({
      alertIds: ['a1'],
      status: 3,
      statusObservation: 'ack',
      addFalsePositiveTag: false,
    });
    expect(post).toHaveBeenCalledWith('/ha-alerts/status', {
      alertIds: ['a1'],
      status: 3,
      statusObservation: 'ack',
      addFalsePositiveTag: false,
    });
  });

  it('posts notes as alertIds and note', async () => {
    const { addAlertNotes } = await import('./alerts.service');
    await addAlertNotes({ alertIds: ['a1'], note: 'reviewed' });
    expect(post).toHaveBeenCalledWith('/ha-alerts/notes', { alertIds: ['a1'], note: 'reviewed' });
  });

  it('posts tags with createRule', async () => {
    const { updateAlertTags } = await import('./alerts.service');
    await updateAlertTags({ alertIds: ['a1'], tags: ['apt'], createRule: false });
    expect(post).toHaveBeenCalledWith('/ha-alerts/tags', {
      alertIds: ['a1'],
      tags: ['apt'],
      createRule: false,
    });
  });

  it('converts alerts using incidentName and alertIds', async () => {
    const { convertToIncident } = await import('./alerts.service');
    post.mockResolvedValue({ id: 9 });
    await convertToIncident({ alertIds: ['a1'], incidentName: 'Burst logon' });
    expect(post).toHaveBeenCalledWith('/ha-alerts/convert-to-incident', {
      alertIds: ['a1'],
      incidentName: 'Burst logon',
      incidentId: 0,
      incidentSource: 'alert',
    });
  });

  it('maps queue list params and cursor envelope onto items/total', async () => {
    get.mockResolvedValue({
      items: [{ id: 'a1', name: 'Encoded PowerShell', severity: 9, status: 2, '@timestamp': '2026-08-18T12:00:00Z' }],
      totalApproximate: 12,
      hasMore: true,
    });
    const { getAlerts } = await import('./alerts.service');
    const result = await getAlerts({
      page: 0,
      size: 50,
      search: 'powershell',
      dateFrom: '2026-08-18T00:00:00.000Z',
      dateTo: '2026-08-18T23:59:59.000Z',
    });
    expect(get).toHaveBeenCalledWith('/ha-alerts', {
      params: expect.objectContaining({
        page: 0,
        size: 50,
        limit: 50,
        q: 'powershell',
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-18T23:59:59.000Z',
      }),
    });
    expect(result.total).toBe(12);
    expect(result.items[0]?.id).toBe('a1');
    expect(result.items[0]?.title).toBe('Encoded PowerShell');
    expect(result.items[0]?.severity).toBe('critical');
    expect(result.items[0]?.status).toBe('open');
  });

  it('exports getOpenAlertCount function', async () => {
    const module = await import('./alerts.service');
    expect(typeof module.getOpenAlertCount).toBe('function');
  });
});
