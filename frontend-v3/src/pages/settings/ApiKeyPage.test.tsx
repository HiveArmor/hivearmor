import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyPage } from './ApiKeyPage';
import { API_KEYS_JOB_SENTENCE } from './apiKeys.honesty';

import { useAuthStore } from '@/store/auth.store';
import type { HaUser } from '@/store/auth.store';
import type { HaApiKeyRecord } from '@/types/apiKey.types';

const listKeys = vi.hoisted(() => vi.fn());

vi.mock('@/services/apiKeys.service', () => ({
  apiKeysService: {
    list: listKeys,
    create: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock('@/hooks/useEpsStream', () => ({
  useEpsStream: () => ({ connected: true, eps: 12840 }),
}));

vi.mock('@/components/status-dock', () => ({
  StatusDock: () => <div data-testid="status-dock">Historical</div>,
}));

vi.mock('@/components/ha-api-key-create-modal/HaApiKeyCreateModal', () => ({
  HaApiKeyCreateModal: () => null,
}));

vi.mock('@/components/ha-api-key-token-dialog/HaApiKeyTokenDialog', () => ({
  HaApiKeyTokenDialog: () => null,
}));

vi.mock('@/components/ha-confirmation-modal/HaConfirmationModal', () => ({
  HaConfirmationModal: () => null,
}));

const sampleKey: HaApiKeyRecord = {
  id: 'key-1',
  name: 'Collector production',
  keyPrefix: 'ha_k7n4Q',
  scopes: ['read_logs'],
  status: 'active',
  createdAt: '2026-01-15T10:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: '2026-01-20T08:30:00.000Z',
};

function user(roles: string[]): HaUser {
  return {
    id: 1,
    login: 'admin',
    firstName: 'API',
    lastName: 'Admin',
    email: 'admin@example.test',
    roles,
    langKey: 'en',
  };
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ApiKeyPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ApiKeyPage', () => {
  beforeEach(() => {
    listKeys.mockReset();
    listKeys.mockResolvedValue([sampleKey]);
    useAuthStore.setState({
      user: user(['ROLE_ADMIN']),
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: 1,
    });
  });

  it('renders Prompt 39 honesty chrome with staging badge and meta links', async () => {
    renderPage();
    expect(await screen.findByText('STAGING CANDIDATE')).toBeVisible();
    expect(screen.getByText(API_KEYS_JOB_SENTENCE)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Integrations' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Connectors' })).toBeVisible();
    expect(screen.getByText('Platform Administrator')).toBeVisible();
  });

  it('never renders plaintext service-key material in inventory', async () => {
    renderPage();
    expect(await screen.findByText('Collector production')).toBeVisible();
    expect(screen.getByText('ha_k7n4Q••••')).toBeVisible();
    expect(screen.queryByText(/^ha_[A-Za-z0-9_-]{20,}$/)).not.toBeInTheDocument();
  });

  it('does not query the inventory for a non-admin role', async () => {
    useAuthStore.setState({
      user: user(['ROLE_ANALYST']),
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: 1,
    });
    renderPage();
    expect(await screen.findByText('Service access restricted')).toBeVisible();
    expect(screen.getByText(/Required permission: Platform Administrator/i)).toBeVisible();
    expect(listKeys).not.toHaveBeenCalled();
  });

  it('distinguishes empty inventory from error state', async () => {
    listKeys.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByTestId('api-keys-empty-honesty')).toBeVisible();
    expect(screen.getByText(/empty key list is not an error/i)).toBeVisible();
  });
});
