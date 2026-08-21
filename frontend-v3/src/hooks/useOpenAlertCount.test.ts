/**
 * useOpenAlertCount Hook Tests
 */

import { describe, it, expect } from 'vitest';

describe('useOpenAlertCount', () => {
  it('exports useOpenAlertCount function', async () => {
    const module = await import('./useOpenAlertCount');
    expect(typeof module.useOpenAlertCount).toBe('function');
  });
});
