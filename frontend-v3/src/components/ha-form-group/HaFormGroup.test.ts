import { describe, it, expect } from 'vitest';

import { HaFormGroup } from './HaFormGroup';

describe('HaFormGroup', () => {
  it('exports HaFormGroup function', () => {
    expect(HaFormGroup).toBeDefined();
    expect(typeof HaFormGroup).toBe('function');
  });
});
