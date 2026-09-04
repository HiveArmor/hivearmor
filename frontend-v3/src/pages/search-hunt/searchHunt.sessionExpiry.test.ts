import { describe, it, expect } from 'vitest';

import { isHuntSessionExpiredError } from './searchHunt.service';

import { ApiError } from '@/lib/apiClient';


describe('isHuntSessionExpiredError', () => {
  it('detects HTTP 410 (snapshot expired)', () => {
    expect(isHuntSessionExpiredError(new ApiError(410, { status: 410, code: 'HUNT_SEARCH_EXPIRED' } as never))).toBe(true);
  });

  it('detects HTTP 404 (session not found)', () => {
    expect(isHuntSessionExpiredError(new ApiError(404, { status: 404, code: 'HUNT_SEARCH_NOT_FOUND' } as never))).toBe(true);
  });

  it('detects the code in the body even on an unexpected status', () => {
    expect(isHuntSessionExpiredError(new ApiError(500, { status: 500, code: 'HUNT_SEARCH_EXPIRED' } as never))).toBe(true);
    expect(isHuntSessionExpiredError(new ApiError(422, { status: 422, detail: 'HUNT_EVENT_NOT_FOUND' } as never))).toBe(true);
  });

  it('does NOT flag unrelated errors', () => {
    expect(isHuntSessionExpiredError(new ApiError(422, { status: 422, code: 'HUNT_QUERY_INVALID' } as never))).toBe(false);
    expect(isHuntSessionExpiredError(new ApiError(403, { status: 403, code: 'HUNT_SEARCH_FORBIDDEN' } as never))).toBe(false);
    expect(isHuntSessionExpiredError(new Error('network'))).toBe(false);
    expect(isHuntSessionExpiredError(null)).toBe(false);
  });
});
