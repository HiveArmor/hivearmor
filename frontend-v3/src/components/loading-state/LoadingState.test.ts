import { describe, it, expect } from 'vitest';

import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('exports LoadingState function', () => {
    expect(LoadingState).toBeDefined();
    expect(typeof LoadingState).toBe('function');
  });
});
