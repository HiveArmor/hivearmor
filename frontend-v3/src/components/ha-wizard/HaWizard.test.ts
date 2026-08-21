import { describe, it, expect } from 'vitest';

import { HaWizard } from './HaWizard';

describe('HaWizard', () => {
  it('exports HaWizard function', () => {
    expect(HaWizard).toBeDefined();
    expect(typeof HaWizard).toBe('function');
  });
});
