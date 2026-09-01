import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddAgentDrawer } from './AddAgentDrawer';

import { ApiError } from '@/lib/apiClient';

const mockCreate = vi.fn();
const mockGet = vi.fn();
let mockSelectedTenantId: number | null = null;

vi.mock('@/services/agentProvisioningService', () => ({
  createAgentKey: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    apiClient: {
      get: (...args: unknown[]) => mockGet(...args),
    },
  };
});

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (
    selector: (state: { selectedTenantId: number | null }) => unknown
  ) => selector({ selectedTenantId: mockSelectedTenantId }),
}));

vi.mock('@/store/theme.store', () => ({
  useThemeStore: (selector: (state: { theme: string }) => unknown) =>
    selector({ theme: 'dark' }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco" />,
}));

const mockCreated = {
  id: '1',
  alias: 'web-server-01',
  key: 'ha_enroll_test.secret',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  mode: 'edr' as const,
  bashScript: '#!/bin/bash\necho "$TOKEN" | sudo install --enrollment-token-file -',
  powershellScript: '# PowerShell\nGet-Content -Raw $TokenFile | install --enrollment-token-file -',
  serverHost: 'localhost',
  createdAt: new Date().toISOString(),
  status: 'active' as const,
};

function renderDrawer(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddAgentDrawer isOpen onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('AddAgentDrawer honesty + 409 UX', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGet.mockReset();
    mockSelectedTenantId = null;
    mockGet.mockResolvedValue([
      {
        filename: 'hivearmor_agent_service_linux_amd64',
        href: '/agent-packages/hivearmor_agent_service_linux_amd64',
        available: false,
        sizeBytes: null,
      },
    ]);
  });

  it('warns when masthead is All tenants and blocks generate', async () => {
    renderDrawer();

    expect(
      await screen.findByText(/Select a tenant in the masthead/i)
    ).toBeVisible();
    expect(
      await screen.findByText(/Agent packages not published on this server/i)
    ).toBeVisible();

    const generateButton = screen.getByRole('button', { name: /Generate install script/i });
    expect(generateButton).toBeDisabled();
  });

  it('maps duplicate alias 409 onto the agent name field', async () => {
    mockSelectedTenantId = 2;
    mockGet.mockResolvedValue([
      {
        filename: 'hivearmor_agent_service_linux_amd64',
        href: '/agent-packages/hivearmor_agent_service_linux_amd64',
        available: true,
        sizeBytes: 10,
      },
    ]);
    mockCreate.mockRejectedValue(
      new ApiError(409, {
        status: 409,
        message: 'An agent with the name "ux-audit-host-01" already exists. Choose a different alias or revoke the existing key first.',
      })
    );

    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/web-server-01/i), 'ux-audit-host-01');
    await user.click(screen.getByRole('button', { name: /Generate install script/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    });
  });
});

describe('AddAgentDrawer script download', () => {
  let downloadInstallScript: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockCreate.mockReset();
    mockGet.mockReset();
    mockSelectedTenantId = 2;
    mockGet.mockResolvedValue([
      {
        filename: 'hivearmor_agent_service_linux_amd64',
        href: '/agent-packages/hivearmor_agent_service_linux_amd64',
        available: true,
        sizeBytes: 10,
      },
    ]);
    mockCreate.mockResolvedValue(mockCreated);

    const downloadModule = await import('@/lib/installScriptDownload');
    downloadInstallScript = vi.spyOn(downloadModule, 'downloadInstallScript').mockImplementation(() => undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  it('offers Linux download with sanitized filename and copy still works', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/web-server-01/i), 'web-server-01');
    await user.click(screen.getByRole('button', { name: /Generate install script/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download hivearmor-install-web-server-01\.sh/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /Copy bash script/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockCreated.bashScript);

    await user.click(screen.getByRole('button', { name: /Download hivearmor-install-web-server-01\.sh/i }));
    expect(downloadInstallScript).toHaveBeenCalledWith(
      mockCreated.bashScript,
      'hivearmor-install-web-server-01.sh'
    );
  });

  it('offers Windows download with sanitized filename on Windows tab', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByPlaceholderText(/web-server-01/i), 'web-server-01');
    await user.click(screen.getByRole('button', { name: /Generate install script/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download hivearmor-install-web-server-01\.sh/i })).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: /Windows/i }));
    await user.click(screen.getByRole('button', { name: /Download hivearmor-install-web-server-01\.ps1/i }));

    expect(downloadInstallScript).toHaveBeenCalledWith(
      mockCreated.powershellScript,
      'hivearmor-install-web-server-01.ps1'
    );
  });
});
