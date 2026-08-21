import { describe, it, expect } from 'vitest';

import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('exports ErrorState function', () => {
    expect(ErrorState).toBeDefined();
    expect(typeof ErrorState).toBe('function');
  });
});
