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
});
