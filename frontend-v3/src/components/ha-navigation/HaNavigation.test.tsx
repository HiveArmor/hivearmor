import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { HaNavigation } from './HaNavigation';

import { useAuthStore } from '@/store/auth.store';
import { useSidebarStore } from '@/store/sidebar.store';
import { useThemeStore } from '@/store/theme.store';

describe('HaNavigation', () => {
  beforeEach(() => {
    localStorage.clear();
    useSidebarStore.setState({ collapsed: true });
    useThemeStore.getState().setTheme('dark');
    useAuthStore.setState({
      user: { id: 1, login: 'analyst', firstName: 'Ari', lastName: 'Patel', email: 'ari@example.test', roles: ['ROLE_ANALYST'], langKey: 'en' },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
  });

  function renderNavigation(): void {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}><HaNavigation /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('starts collapsed with an accessible active route', () => {
    renderNavigation();
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(navigation).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: 'Mission Control' })).toHaveAttribute('aria-current', 'page');
  });

  it('expands on hover and restores the collapsed rail on pointer exit', () => {
    renderNavigation();
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    fireEvent.mouseEnter(navigation);
    expect(navigation).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByText('Mission Control')).toBeVisible();
    fireEvent.mouseLeave(navigation);
    expect(navigation).toHaveAttribute('data-expanded', 'false');
  });

  it('maps Threat Constellation to the Investigate section', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Threat Constellation' })).toBeVisible();
  });

  it('exposes usable orphaned routes for an analyst', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Hive Intelligence' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'UEBA Risk' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Response Activity' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Detection Coverage' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'File Integrity' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quarantine & Containment' })).toBeVisible();
  });

  it('hides File Integrity from roles outside Analyst, SOC Manager, and Platform Administrator', () => {
    useAuthStore.setState({
      user: {
        id: 9,
        login: 'reader',
        firstName: 'Read',
        lastName: 'Only',
        email: 'reader@example.test',
        roles: ['ROLE_USER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.queryByRole('button', { name: 'File Integrity' })).not.toBeInTheDocument();
  });

  it('Wave A1: hides queue-tier Command routes from ROLE_USER (ALERT_QUEUE_AUTH)', () => {
    useAuthStore.setState({
      user: {
        id: 9,
        login: 'reader',
        firstName: 'Read',
        lastName: 'Only',
        email: 'reader@example.test',
        roles: ['ROLE_USER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Mission Control' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Analyst Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alerts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correlated Findings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Incidents' })).not.toBeInTheDocument();
  });

  it('Wave A1: exposes Command triage routes for ROLE_SOC_ANALYST', () => {
    useAuthStore.setState({
      user: {
        id: 11,
        login: 'socanalyst',
        firstName: 'Soc',
        lastName: 'Analyst',
        email: 'soc@example.test',
        roles: ['ROLE_SOC_ANALYST'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Analyst Queue' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Correlated Findings' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Incidents' })).toBeVisible();
  });

  it('Wave A2: hides Search/Entities/Constellation from ROLE_USER', () => {
    useAuthStore.setState({
      user: {
        id: 9,
        login: 'reader',
        firstName: 'Read',
        lastName: 'Only',
        email: 'reader@example.test',
        roles: ['ROLE_USER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.queryByRole('button', { name: 'Search & Hunt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entities' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Threat Constellation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Investigations' })).toBeVisible();
  });

  it('Wave A2: exposes Investigate queue-tier routes for ROLE_SOC_ANALYST', () => {
    useAuthStore.setState({
      user: {
        id: 11,
        login: 'socanalyst',
        firstName: 'Soc',
        lastName: 'Analyst',
        email: 'soc@example.test',
        roles: ['ROLE_SOC_ANALYST'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Search & Hunt' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entities' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Threat Constellation' })).toBeVisible();
  });

  it('exposes UEBA Risk for SOC Manager', () => {
    useAuthStore.setState({
      user: {
        id: 3,
        login: 'socmgr',
        firstName: 'Sam',
        lastName: 'Manager',
        email: 'sam@example.test',
        roles: ['ROLE_SOC_MANAGER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'UEBA Risk' })).toBeVisible();
  });

  it('keeps admin-only orphaned routes out of the analyst rail', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.queryByRole('button', { name: 'API Keys' })).not.toBeInTheDocument();
  });

  it('exposes API Keys and Data Sources for administrators', () => {
    useAuthStore.setState({
      user: {
        id: 2,
        login: 'admin',
        firstName: 'Ada',
        lastName: 'Admin',
        email: 'ada@example.test',
        roles: ['ROLE_ADMIN'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'API Keys' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Data Sources' })).toBeVisible();
  });

  it('pins the navigation open from the keyboard-accessible control', () => {
    renderNavigation();
    fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar open' }));
    expect(useSidebarStore.getState().collapsed).toBe(false);
    expect(screen.getByRole('button', { name: 'Use hover expansion' })).toBeVisible();
  });

  it('shows the compact theme toggle only while expanded and changes mode', () => {
    renderNavigation();
    expect(screen.queryByRole('button', { name: 'Modern theme' })).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modern theme' }));

    expect(useThemeStore.getState().theme).toBe('modern');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'modern');

    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('keeps account access in the navigation footer without dead profile links', () => {
    renderNavigation();
    const userMenu = screen.getByRole('button', { name: 'User menu' });
    expect(userMenu).toBeVisible();
    fireEvent.click(userMenu);
    expect(screen.getByRole('menu', { name: 'Account actions' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'My Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Change Password' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toBeVisible();
  });

  it('keeps section separators visible in both sidebar states and uses compact expanded rows', () => {
    const cssSource = readFileSync(join(__dirname, 'HaNavigation.css'), 'utf8');

    expect(cssSource).toContain('.ha-nav-section + .ha-nav-section::before');
    expect(cssSource).toContain(".ha-navigation[data-expanded='false'] .ha-nav-section + .ha-nav-section::before");
    expect(cssSource).toContain('min-height: 36px');
  });

  // ── W4 IA — Endpoint Security consolidation ──────────────────────────────
  it('W4 IA: renders the Endpoint Security section for an analyst', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    // Section landmark uses its title as aria-label.
    expect(screen.getByRole('region', { name: 'ENDPOINT SECURITY' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Endpoints' })).toBeVisible();
  });

  it('W4 IA: Endpoints entry points at the canonical /endpoints fleet home', () => {
    // Active-state is prefix-matched: on /endpoints the Endpoints item is aria-current.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/endpoints']}><HaNavigation /></MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Endpoints' })).toHaveAttribute('aria-current', 'page');
  });

  it('W4 IA: Endpoint Security co-locates FIM findings, FIM policies, and agent policies', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'File Integrity' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'FIM Policies' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Agent Policies' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Response Actions' })).toBeVisible();
    // Data Sources is analyst-visible here (surfaced from ADMIN into the endpoint context).
    expect(screen.getByRole('button', { name: 'Data Sources' })).toBeVisible();
  });

  it('W4 IA: single canonical Agent Policies entry (no duplicate rendered)', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getAllByRole('button', { name: 'Agent Policies' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Data Sources' })).toHaveLength(1);
  });

  it('W4 IA: Sensors and Agent FIM Policies are gone from POSTURE (moved to Endpoint Security)', () => {
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.queryByRole('button', { name: 'Sensors' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agent FIM Policies' })).not.toBeInTheDocument();
    // The old ENDPOINT DEFENSE section title is retired.
    expect(screen.queryByRole('region', { name: 'ENDPOINT DEFENSE' })).not.toBeInTheDocument();
  });

  it('W4 IA: hides the whole Endpoint Security section from ROLE_USER (role filtering preserved)', () => {
    useAuthStore.setState({
      user: {
        id: 9,
        login: 'reader',
        firstName: 'Read',
        lastName: 'Only',
        email: 'reader@example.test',
        roles: ['ROLE_USER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.queryByRole('button', { name: 'Endpoints' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'FIM Policies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'ENDPOINT SECURITY' })).not.toBeInTheDocument();
  });

  it('W4 IA: Connector SDK surfaces for SOC Manager under Endpoint Security', () => {
    useAuthStore.setState({
      user: {
        id: 3,
        login: 'socmgr',
        firstName: 'Sam',
        lastName: 'Manager',
        email: 'sam@example.test',
        roles: ['ROLE_SOC_MANAGER'],
        langKey: 'en',
      },
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      selectedTenantId: null,
    });
    renderNavigation();
    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    expect(screen.getByRole('button', { name: 'Connector SDK' })).toBeVisible();
  });
});
