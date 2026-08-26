import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentPackageCatalog } from './AgentPackageCatalog';

const mockGet = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('@/services/agentPackage.service', () => ({
  fetchAgentPackageSummary: () => mockGet(),
}));

function renderCatalog(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AgentPackageCatalog />
    </QueryClientProvider>
  );
}

describe('AgentPackageCatalog', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('disables unpublished packages instead of offering a download link', async () => {
    mockGet.mockResolvedValue({
      latestVersion: '11.0.0-staging',
      updaterVersion: '11.0.0-staging',
      publishedCount: 1,
      totalCount: 6,
      packages: [
        {
          filename: 'hivearmor_agent_service_linux_amd64',
          href: '/agent-packages/hivearmor_agent_service_linux_amd64',
          available: true,
          sizeBytes: 1024,
        },
        {
          filename: 'hivearmor_agent_service_linux_arm64',
          href: '/agent-packages/hivearmor_agent_service_linux_arm64',
          available: false,
          sizeBytes: null,
        },
      ],
    });

    renderCatalog();

    expect(await screen.findByRole('link', { name: /Download/i })).toBeVisible();
    expect(screen.getAllByText('Not published').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link')).toHaveLength(1);
    expect(screen.getByText(/Prefer/i)).toBeVisible();
    expect(screen.getByText(/Add Agent/i)).toBeVisible();
    expect(screen.getByText(/11\.0\.0-staging/)).toBeVisible();
  });

  it('alerts when no binaries are published on the server', async () => {
    mockGet.mockResolvedValue({
      latestVersion: null,
      updaterVersion: null,
      publishedCount: 0,
      totalCount: 6,
      packages: [
        {
          filename: 'hivearmor_agent_service_linux_amd64',
          href: '/agent-packages/hivearmor_agent_service_linux_amd64',
          available: false,
          sizeBytes: null,
        },
      ],
    });

    renderCatalog();

    expect(await screen.findByRole('alert')).toHaveTextContent(/No agent binaries are published/i);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
