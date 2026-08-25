/**
 * Offenses Service Tests (Correlated Findings)
 */

import { describe, it, expect } from 'vitest';

describe('offenses.service', () => {
  it('exports getOffenses function', async () => {
    const module = await import('./offenses.service');
    expect(typeof module.getOffenses).toBe('function');
  });

  it('exports getOffense function', async () => {
    const module = await import('./offenses.service');
    expect(typeof module.getOffense).toBe('function');
  });

  it('exports updateOffenseStatus function', async () => {
    const module = await import('./offenses.service');
    expect(typeof module.updateOffenseStatus).toBe('function');
  });

  it('exports getOffenseAlerts function', async () => {
    const module = await import('./offenses.service');
    expect(typeof module.getOffenseAlerts).toBe('function');
  });

  it('re-exports SEC-03 capability gate aligned with backend ALERT_QUEUE_AUTH', async () => {
    const module = await import('./offenses.service');
    expect(module.GAP_SEC_03_RESOLVED).toBe(true);
    expect(module.canUpdateOffenseStatus(['ROLE_ANALYST'])).toBe(true);
    expect(module.canUpdateOffenseStatus(['ROLE_USER'])).toBe(false);
  });
});
