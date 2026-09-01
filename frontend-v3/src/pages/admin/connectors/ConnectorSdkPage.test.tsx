import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ConnectorSdkPage } from './ConnectorSdkPage';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector?: (state: { hasRole: (role: string) => boolean }) => unknown) => {
    const state = {
      hasRole: (role: string) => role === 'ROLE_ADMIN' || role === 'ROLE_SOC_MANAGER',
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/hooks/useEpsStream', () => ({
  useEpsStream: () => ({ connected: false, eps: 0 }),
}));

vi.mock('@/services/connectorService', () => ({
  connectorService: {
    listCatalog: vi.fn().mockResolvedValue([]),
    listInstances: vi.fn().mockResolvedValue([]),
    listStagedAlerts: vi.fn().mockResolvedValue({
      alerts: [],
      count: 0,
      destination: 'ha_connector_alert_staging',
      persisted: true,
      note: 'test',
    }),
  },
}));

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConnectorSdkPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConnectorSdkPage', () => {
  it('renders STAGING CANDIDATE identity chrome and job sentence', () => {
    renderPage();
    expect(screen.getByText('STAGING CANDIDATE')).toBeInTheDocument();
    expect(screen.getByText(/Typed connector SDK/i)).toBeInTheDocument();
    expect(screen.getByText('SOC Manager · Platform Administrator')).toBeInTheDocument();
  });
});
