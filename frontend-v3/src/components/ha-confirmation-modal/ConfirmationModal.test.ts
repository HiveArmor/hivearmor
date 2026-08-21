import { describe, it, expect } from 'vitest';

import { ConfirmationModal } from './ConfirmationModal';

describe('ConfirmationModal', () => {
  it('exports ConfirmationModal function', () => {
    expect(ConfirmationModal).toBeDefined();
    expect(typeof ConfirmationModal).toBe('function');
  });
});
