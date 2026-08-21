import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

import { useAuthStore } from '@/store/auth.store';

const authMocks = vi.hoisted(() => ({ authenticate: vi.fn(), getAccount: vi.fn() }));

vi.mock('@/services/auth.service', () => authMocks);
vi.mock('@/hooks/useSsoProviders', () => ({
  useEnabledSsoProviders: () => ({
    data: [{ id: 7, providerName: 'Northwind Identity', discoveryUrl: 'https://identity.example.test' }],
    isLoading: false,
    isError: false,
  }),
}));

function renderLogin(entry = '/login'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      selectedTenantId: null,
    });
    vi.clearAllMocks();
  });

  it('does not redirect on an unvalidated stale token', () => {
    localStorage.setItem('hivearmor_auth_token', 'expired-or-fixture-token');
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in to HiveArmor' })).toBeVisible();
    expect(screen.queryByText('Dashboard workspace')).not.toBeInTheDocument();
  });

  it('renders enterprise credentials and SSO controls', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Sign in to HiveArmor' })).toBeVisible();
    expect(screen.getByLabelText('Work email or username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Continue with Northwind Identity' })).toBeVisible();
  });

  it('validates required fields without submitting', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your work email or username.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    expect(authMocks.authenticate).not.toHaveBeenCalled();
  });

  it('toggles password visibility with the keyboard', async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText('Password');
    await user.type(password, 'secure-password');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeVisible();
  });

  it('shows a non-sensitive authentication error and clears the password', async () => {
    authMocks.authenticate.mockRejectedValueOnce({ status: 401 });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Work email or username'), 'analyst@example.test');
    await user.type(screen.getByLabelText('Password'), 'incorrect');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('The credentials could not be verified. Check your details and try again.')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''));
  });

  it('renders session-expired guidance from the route state', () => {
    renderLogin('/login?expired=true');
    expect(screen.getByText('Your session expired. Sign in again to continue securely.')).toBeVisible();
  });
});
