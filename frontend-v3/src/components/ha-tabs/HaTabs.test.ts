import { describe, it, expect } from 'vitest';

import { HaTabs } from './HaTabs';

describe('HaTabs', () => {
  it('exports HaTabs function', () => {
    expect(HaTabs).toBeDefined();
    expect(typeof HaTabs).toBe('function');
  });
});
