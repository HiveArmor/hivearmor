import { describe, it, expect } from 'vitest';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('exports EmptyState function', () => {
    expect(EmptyState).toBeDefined();
    expect(typeof EmptyState).toBe('function');
  });
});
