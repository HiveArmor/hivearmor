import { describe, it, expect } from 'vitest';

import { HaButton } from './HaButton';

describe('HaButton', () => {
  it('exports HaButton function', () => {
    expect(HaButton).toBeDefined();
    expect(typeof HaButton).toBe('function');
  });
});
