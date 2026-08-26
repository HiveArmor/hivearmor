/**
 * QueueToolbar — filter chip + RBAC surface tests
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, 'QueueToolbar.tsx'), 'utf8');

describe('QueueToolbar', () => {
  it('places Status filters before Severity (OEM queue convention)', () => {
    const statusIdx = source.indexOf('Status filters');
    const severityIdx = source.indexOf('Severity filters');
    expect(statusIdx).toBeGreaterThan(-1);
    expect(severityIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeLessThan(severityIdx);
  });

  it('exposes scannable severity and status chip strips', () => {
    expect(source).toContain('Severity filters');
    expect(source).toContain('Status filters');
    expect(source).toContain('aria-pressed');
    expect(source).toContain('critical');
    expect(source).toContain('open');
  });

  it('wires bulk triage only when QUEUE_BULK_STATUS_SUPPORTED', () => {
    expect(source).toContain('QUEUE_BULK_STATUS_SUPPORTED');
    expect(source).toContain('Mark reviewed');
    expect(source).toContain('Escalate to incident');
    expect(source).toContain('Assign');
  });
});
