/**
 * AfterActionReportsPage — Tests
 */

import { describe, it, expect } from 'vitest';

describe('AfterActionReportsPage', () => {
  it('exports AfterActionReportsPage component', async () => {
    const module = await import('./AfterActionReportsPage');
    expect(module.AfterActionReportsPage).toBeTruthy();
    expect(typeof module.AfterActionReportsPage).toBe('function');
  });
});
