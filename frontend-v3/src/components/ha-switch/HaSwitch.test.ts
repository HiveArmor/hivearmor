import { describe, it, expect } from 'vitest';

import { HaSwitch } from './HaSwitch';

describe('HaSwitch', () => {
  it('exports HaSwitch function', () => {
    expect(HaSwitch).toBeDefined();
    expect(typeof HaSwitch).toBe('function');
  });
});
