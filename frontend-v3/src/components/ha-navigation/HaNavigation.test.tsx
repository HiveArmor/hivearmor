import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    render(<MemoryRouter initialEntries={['/dashboard']}><HaNavigation /></MemoryRouter>);
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
    expect(screen.queryByRole('button', { name: 'Data Sources' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Switch to light mode' })).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('navigation', { name: 'Primary navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));

    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-ha-theme', 'light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
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
});
