/**
 * TenantsPage.tsx — Tenant administration probe.
 * GET /api/ha-tenants currently returns 500 on local-dev; keep an honest error.
 */

import { useQuery } from '@tanstack/react-query';

import { ApiError, apiClient } from '@/lib/apiClient';

interface TenantListProbe {
  items?: unknown[];
}

export function TenantsPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['tenants', 'readiness-probe'],
    queryFn: () => apiClient.get<TenantListProbe>('/ha-tenants', { params: { size: 1 } }),
    retry: false,
  });

  const status = error instanceof ApiError ? error.status : null;

  if (isLoading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-base)' }}>Checking tenant administration API…</p>
      </div>
    );
  }

  if (error || data === undefined) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 'var(--ha-text-xl)',
              color: 'var(--ha-text-primary)',
              marginBottom: '12px',
            }}
          >
            Tenant administration is unavailable
          </h1>
          <p
            style={{
              fontSize: 'var(--ha-text-base)',
              color: 'var(--ha-text-secondary)',
              maxWidth: '700px',
              margin: '0 auto',
            }}
          >
            {status !== null
              ? `GET /api/ha-tenants returned HTTP ${String(status)}. Tenant list, create, and membership management stay disabled until that endpoint succeeds.`
              : 'GET /api/ha-tenants could not be reached. Tenant list, create, and membership management stay disabled.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div
        style={{
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          padding: '48px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--ha-text-xl)',
            color: 'var(--ha-text-primary)',
            marginBottom: '12px',
          }}
        >
          Tenant administration
        </h1>
        <p
          style={{
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          GET /api/ha-tenants responded successfully. Full tenant create and membership UI is not implemented in this slice.
        </p>
      </div>
    </div>
  );
}
