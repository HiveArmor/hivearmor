/**
 * Analyst Queue — capability + UX honesty tests (Prompt 06)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  canAssignQueueAlerts,
  canTriageQueueAlerts,
  QUEUE_ASSIGN_DENIED,
  QUEUE_BULK_STATUS_SUPPORTED,
  QUEUE_JOB_SENTENCE,
  QUEUE_TRIAGE_DENIED,
} from './analystQueue.capabilities';

const dir = dirname(fileURLToPath(import.meta.url));

describe('analystQueue.capabilities', () => {
  it('allows ALERT_MUTATION_AUTH roles to triage', () => {
    expect(canTriageQueueAlerts(['ROLE_ANALYST'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_SOC_ANALYST'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_ADMIN'])).toBe(true);
    expect(canTriageQueueAlerts(['ROLE_USER'])).toBe(false);
    expect(canTriageQueueAlerts(['ROLE_READ_ONLY'])).toBe(false);
  });

  it('gates assignment to SOC Manager or Platform Administrator', () => {
    expect(canAssignQueueAlerts(['ROLE_ANALYST'])).toBe(false);
    expect(canAssignQueueAlerts(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canAssignQueueAlerts(['ROLE_ADMIN'])).toBe(true);
  });

  it('uses human role labels on deny copy', () => {
    expect(QUEUE_TRIAGE_DENIED).toContain('Analyst');
    expect(QUEUE_TRIAGE_DENIED).toContain('SOC Manager');
    expect(QUEUE_TRIAGE_DENIED).toContain('Platform Administrator');
    expect(QUEUE_TRIAGE_DENIED).not.toMatch(/ROLE_/);
    expect(QUEUE_ASSIGN_DENIED).toBe('Required permission: SOC Manager');
    expect(QUEUE_ASSIGN_DENIED).not.toMatch(/ROLE_/);
  });

  it('declares bulk status supported (POST /api/ha-alerts/status alertIds[])', () => {
    expect(QUEUE_BULK_STATUS_SUPPORTED).toBe(true);
  });
});

describe('AnalystQueuePage UX contracts', () => {
  it('exports the triage job sentence', () => {
    expect(QUEUE_JOB_SENTENCE).toBe('Triage open alerts for this shift');
  });

  it('keeps job sentence and cross-links in page source', () => {
    const source = readFileSync(join(dir, 'AnalystQueuePage.tsx'), 'utf8');
    expect(source).toContain('QUEUE_JOB_SENTENCE');
    expect(source).toContain('to="/dashboard"');
    expect(source).toContain('to="/alerts"');
    expect(source).toContain('to="/incidents"');
    expect(source).toContain("mode={dockLive ? 'live' : 'historical'}");
    expect(source).toContain('updateAlertStatus');
    expect(source).toContain('AssignmentDialog');
  });

  it('toolbar uses chip filters and bulk honesty flag', () => {
    const source = readFileSync(join(dir, 'components/QueueToolbar.tsx'), 'utf8');
    expect(source).toContain('aq-chip-strip');
    expect(source).toContain('QUEUE_BULK_STATUS_SUPPORTED');
    expect(source).toContain('QUEUE_TRIAGE_DENIED');
    expect(source).toContain('QUEUE_ASSIGN_DENIED');
  });

  it('does not import shared alert column module into queue columns', () => {
    const columns = readFileSync(join(dir, 'queueColumns.tsx'), 'utf8');
    expect(columns).toContain("@/lib/severity");
    expect(columns).not.toMatch(/from ['"]@\/pages\/alerts\/alertColumns/);
    expect(columns).toContain('createQueueColumnDefs');
  });
});
