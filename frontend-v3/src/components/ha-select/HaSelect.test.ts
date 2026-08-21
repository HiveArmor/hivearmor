import { describe, it, expect } from 'vitest';

import { HaSelect } from './HaSelect';

describe('HaSelect', () => {
  it('exports HaSelect function', () => {
    expect(HaSelect).toBeDefined();
    expect(typeof HaSelect).toBe('function');
  });
});
