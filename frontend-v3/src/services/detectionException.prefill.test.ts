import { describe, expect, it } from 'vitest';

import { getFoundationAlertDetail } from '@/pages/alerts/alertTriage.fixtures';
import {
  extractHostNameFromAlert,
  extractUserNameFromAlert,
  prefillExceptionDraftFromAlert,
  usableExceptionPrefillValue,
} from '@/services/detectionException.service';

describe('DET-FP-002 exception draft prefill', () => {
  it('ignores placeholder host and user values', () => {
    expect(usableExceptionPrefillValue('—')).toBeNull();
    expect(usableExceptionPrefillValue('Unavailable')).toBeNull();
    expect(usableExceptionPrefillValue('FIN-WKS-044')).toBe('FIN-WKS-044');
  });

  it('prefills host, user, and ruleId from a foundation triage alert', () => {
    const alert = getFoundationAlertDetail('ALT-7F3A91');
    const draft = prefillExceptionDraftFromAlert(alert);
    expect(draft.ruleId).toBe('RULE-ENDPOINT-184');
    expect(draft.hostName).toBe('FIN-WKS-044');
    expect(draft.conditions.some((row) => row.field === 'host.name' && row.value === 'FIN-WKS-044')).toBe(true);
    expect(draft.title).toContain('Encoded script');
    expect(draft.reason).toContain('ALT-7F3A91');
  });

  it('prefills user.name from a user-entity alert', () => {
    const alert = getFoundationAlertDetail('ALT-D0C441');
    expect(extractUserNameFromAlert(alert)).toBe('svc-finance@northstar.example');
    const draft = prefillExceptionDraftFromAlert(alert);
    expect(draft.ruleId).toBe('RULE-ID-092');
    expect(draft.conditions.some((row) => row.field === 'user.name' && row.value === 'svc-finance@northstar.example')).toBe(true);
  });

  it('falls back to adversary/target sides when raw fields are placeholders', () => {
    expect(extractHostNameFromAlert({
      rawFields: { 'host.name': '—' },
      target: { hostname: 'lab-host-01', username: null },
    })).toBe('lab-host-01');
    expect(extractUserNameFromAlert({
      rawFields: { 'user.name': 'Unavailable' },
      adversary: { hostname: null, username: 'svc_backup' },
    })).toBe('svc_backup');
  });
});
