import { afterEach, describe, expect, it, vi } from 'vitest';

import { listResponseActions, previewAction } from './incident-workbench.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('incident workbench response adapters', () => {
  it('normalizes Kiro response-action catalog envelopes for the analyst UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      actions: [{
        id: 'isolate-host',
        name: 'Isolate Host',
        description: 'Restrict host networking',
        category: 'containment',
        targetType: 'host',
        requiresApproval: true,
      }],
      total: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const actions = await listResponseActions('4821');
    expect(actions).toEqual([expect.objectContaining({
      id: 'isolate-host',
      enabled: true,
      requiredEntities: ['host'],
      requiresApproval: true,
    })]);
  });

  it('normalizes object targets and backend actionName in response previews', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      incidentId: '4821',
      actionId: 'isolate-host',
      actionName: 'Isolate Host',
      targets: [{ id: 'host-44', type: 'host', value: 'FIN-WKS-044' }],
      impact: { description: 'Network access is restricted', reversible: true },
      previewToken: 'signed-preview',
      expiresAt: '2026-08-11T13:23:00.000Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const preview = await previewAction('4821', 'isolate-host');
    expect(preview.name).toBe('Isolate Host');
    expect(preview.targets[0]).toEqual({ id: 'host-44', type: 'host', value: 'FIN-WKS-044' });
    expect(preview.impact.affectedSystems).toEqual(['FIN-WKS-044']);
    expect(preview.executionReady).toBe(false);
  });
});
