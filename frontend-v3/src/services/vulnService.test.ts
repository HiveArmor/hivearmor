import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchScaResults, fetchVulnFindings, VulnApiError } from './vulnService';

import { useAuthStore } from '@/store/auth.store';

describe('vulnService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.setState({ selectedTenantId: 42 });
  });

  it('sends auth, tenant scope, bounded filters and the caller cancellation signal', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Total-Count': '0' },
    }));

    await fetchVulnFindings({ cve: 'CVE-2026', severity: 'CRITICAL', isKev: true, page: 2, size: 50 }, controller.signal);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/ha-vuln/findings?');
    expect(url).toContain('cve=CVE-2026');
    expect(url).toContain('severity=CRITICAL');
    expect(url).toContain('isKev=true');
    expect(url).toContain('page=2');
    expect(url).toContain('size=50');
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token', 'X-Tenant-ID': '42' });
  });

  it('preserves status for permission-aware UI states', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Not permitted' }), {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json' },
    }));

    await expect(fetchVulnFindings()).rejects.toMatchObject({ status: 403, message: 'Not permitted' } satisfies Partial<VulnApiError>);
  });

  it('sends bounded SCA filters, tenant scope and cancellation without fixture records', async () => {
    localStorage.setItem('hivearmor_auth_token', 'sca-token');
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Total-Count': '0' },
    }));

    await fetchScaResults({ agentId: 'agent-fin-044', checkId: 'CIS-1.1.1', status: 'FAIL', level: 'L1', page: 1, size: 50 }, controller.signal);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/ha-cis/results?');
    expect(url).toContain('agentId=agent-fin-044');
    expect(url).toContain('checkId=CIS-1.1.1');
    expect(url).toContain('status=FAIL');
    expect(url).toContain('level=L1');
    expect(url).toContain('page=1');
    expect(url).toContain('size=50');
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sca-token', 'X-Tenant-ID': '42' });
  });
});
