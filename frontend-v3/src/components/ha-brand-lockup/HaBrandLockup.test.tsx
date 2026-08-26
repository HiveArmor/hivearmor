import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HaBrandLockup } from './HaBrandLockup';

describe('HaBrandLockup', () => {
  it('serves the mark from the stable public brand path', () => {
    render(<HaBrandLockup variant="mark" size={28} />);
    const img = screen.getByRole('img', { name: 'HiveArmor' });
    expect(img).toHaveAttribute('src', '/brand/hivearmor-mark.png');
  });

  it('serves the lockup from the stable public brand path', () => {
    render(<HaBrandLockup variant="lockup" size={48} />);
    const img = screen.getByRole('img', { name: 'HiveArmor' });
    expect(img).toHaveAttribute('src', '/brand/hivearmor-lockup.png');
  });
});
