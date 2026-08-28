import { describe, it, expect } from 'vitest';

import { ApiError } from '@/lib/apiClient';
import { formatSocAiHttpHonesty } from '@/services/socAi.service';

describe('formatSocAiHttpHonesty', () => {
  it('returns session guidance when 403 but user has local role', () => {
    const message = formatSocAiHttpHonesty(new ApiError(403, { status: 403 }), {
      hasLocalRole: true,
    });
    expect(message).toContain('session may be outdated');
  });

  it('returns permission label when 403 without local role', () => {
    const message = formatSocAiHttpHonesty(new ApiError(403, { status: 403 }), {
      hasLocalRole: false,
    });
    expect(message).toContain('Required permission');
  });
});
