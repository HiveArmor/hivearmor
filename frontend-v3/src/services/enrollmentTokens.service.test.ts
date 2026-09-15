/**
 * enrollmentTokens.service tests (SPEC-07 W6 6.3) — verifies the list adapter
 * and that revoke sends the required reason + optimistic-concurrency version,
 * and never a secret value.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listEnrollmentTokens, revokeEnrollmentToken, type EnrollmentTokenRow } from './enrollmentTokens.service';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: mocks.get, post: mocks.post },
  ApiError: class ApiError extends Error {},
}));

describe('listEnrollmentTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adapts wire rows, normalizes status, and sorts newest-first', async () => {
    mocks.get.mockResolvedValue([
      { id: 'a', status: 'active', createdAt: '2026-09-01T00:00:00Z', maxUses: 5, useCount: 1, version: 2 },
      { id: 'b', status: 'REVOKED', createdAt: '2026-09-03T00:00:00Z', maxUses: 1, useCount: 0, version: 1 },
    ]);
    const rows = await listEnrollmentTokens();
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']); // newest-first
    expect(rows[0].status).toBe('REVOKED');
    expect(rows[1].status).toBe('ACTIVE');
    expect(rows[1].version).toBe(2);
  });
});

describe('revokeEnrollmentToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts the reason + expectedVersion (never a secret) to the revoke route', async () => {
    const token = { id: 'tok-9', version: 7 } as EnrollmentTokenRow;
    mocks.post.mockResolvedValue({ id: 'tok-9', status: 'REVOKED', version: 8 });
    await revokeEnrollmentToken(token, 'rotating credentials');
    expect(mocks.post).toHaveBeenCalledWith(
      '/ha-agent-enrollments/tok-9/revoke',
      { reason: 'rotating credentials', expectedVersion: 7 },
      expect.any(Object),
    );
  });
});
