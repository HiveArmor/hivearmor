import { describe, it, expect } from 'vitest';

import { HaToggleGroup } from './HaToggleGroup';

describe('HaToggleGroup', () => {
  it('exports HaToggleGroup function', () => {
    expect(HaToggleGroup).toBeDefined();
    expect(typeof HaToggleGroup).toBe('function');
  });
});
