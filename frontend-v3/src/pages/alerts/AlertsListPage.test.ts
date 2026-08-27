/**
 * Alerts inventory UX contracts — Prompt 07.
 * Source-level invariants (Vitest). STAGING CANDIDATE vocabulary only.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('AlertsListPage inventory UX contracts', () => {
  it('states inventory job and cross-links Queue / Mission Control / Incidents', () => {
    const source = readFileSync(join(dir, 'AlertsListPage.tsx'), 'utf8');
    expect(source).toContain('ALERTS_INVENTORY_JOB_SENTENCE');
    expect(source).toContain('full alert inventory');
    expect(source).toContain('Analyst Queue');
    expect(source).toContain('to="/queue"');
    expect(source).toContain('to="/dashboard"');
    expect(source).toContain('to="/incidents"');
    expect(source).toContain('to="/alerts/board"');
  });

  it('defaults to All inventory scope — not Queue-style Needs triage', () => {
    const source = readFileSync(join(dir, 'AlertsListPage.tsx'), 'utf8');
    expect(source).toContain("useState<AlertQueueView['id']>('all')");
    expect(source).not.toContain('needs-triage');
    expect(source).not.toContain('sla-risk');
    expect(source).not.toContain('alert-queue-metrics');
    expect(source).toContain('Any severity');
    expect(source).toContain('Any status');
  });

  it('uses human role labels on mutate deny and shared alert columns', () => {
    const source = readFileSync(join(dir, 'AlertsListPage.tsx'), 'utf8');
    expect(source).toContain('ROLE_LABELS');
    expect(source).toContain('Required permission:');
    expect(source).toContain("from './alertColumns'");
    expect(source).toContain('StatusDock');
    expect(source).toContain('LiveModeToggle');
  });
});
