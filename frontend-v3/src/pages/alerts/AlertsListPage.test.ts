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
  it('uses the compact HaPageHeader band with the inventory scope (no cross-link strip)', () => {
    const source = readFileSync(join(dir, 'AlertsListPage.tsx'), 'utf8');
    expect(source).toContain('HaPageHeader');
    expect(source).toContain("title=\"Alerts\"");
    expect(source).toContain('full alert inventory');
    // The old cross-page nav strip was removed — its links must be gone.
    expect(source).not.toContain('alert-inventory-meta');
    expect(source).not.toContain('to="/dashboard"');
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
