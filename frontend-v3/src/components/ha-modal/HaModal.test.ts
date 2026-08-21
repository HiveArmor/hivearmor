import { describe, it, expect } from 'vitest';

import { HaModal } from './HaModal';

describe('HaModal', () => {
  it('exports HaModal function', () => {
    expect(HaModal).toBeDefined();
    expect(typeof HaModal).toBe('function');
  });
});
