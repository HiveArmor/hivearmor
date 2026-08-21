import { describe, it, expect } from 'vitest';

import { ToastStack, useToastStore } from './index';

describe('ToastStack', () => {
  it('exports ToastStack function', () => {
    expect(ToastStack).toBeDefined();
    expect(typeof ToastStack).toBe('function');
  });

  it('exports useToastStore hook', () => {
    expect(useToastStore).toBeDefined();
    expect(typeof useToastStore).toBe('function');
  });
});
