import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EnrollmentAuditTenantRequiredError,
  listEnrollmentAudit,
} from './enrollmentAudit.service';

const getState = vi.fn();

vi.mock('@/store/auth.store', () => ({
  useAuthStore: {
    getState: () => getState(),
  },
}));

describe('enrollmentAudit.service', () => {
  beforeEach(() => {
    getState.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });

  it('fails closed without a masthead tenant before calling the API', async () => {
    getState.mockReturnValue({ selectedTenantId: null });
    await expect(listEnrollmentAudit()).rejects.toBeInstanceOf(EnrollmentAuditTenantRequiredError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends X-Tenant-ID when a tenant is selected', async () => {
    getState.mockReturnValue({ selectedTenantId: 1 });
    localStorage.setItem('hivearmor_auth_token', 'test-token');
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'X-Total-Count': '0', 'Content-Type': 'application/json' },
      })
    );

    const result = await listEnrollmentAudit({ page: 0, size: 25 });
    expect(result.total).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Tenant-ID']).toBe('1');
    expect(headers.Authorization).toBe('Bearer test-token');
  });
});
