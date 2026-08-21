/**
 * IncidentReportsPage — Tests
 */

import { describe, it, expect } from 'vitest';

describe('IncidentReportsPage', () => {
  it('exports IncidentReportsPage component', async () => {
    const module = await import('./IncidentReportsPage');
    expect(module.IncidentReportsPage).toBeTruthy();
    expect(typeof module.IncidentReportsPage).toBe('function');
  });
});
