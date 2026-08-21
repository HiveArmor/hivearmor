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

  it('keeps account access in the navigation footer in collapsed and expanded states', () => {
    renderNavigation();
    const userMenu = screen.getByRole('button', { name: 'User menu' });
    expect(userMenu).toBeVisible();
    fireEvent.click(userMenu);
    expect(screen.getByRole('menu', { name: 'Account actions' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'My Profile' })).toBeVisible();
  });

  it('keeps section separators visible in both sidebar states and uses compact expanded rows', () => {
    const cssSource = readFileSync(join(__dirname, 'HaNavigation.css'), 'utf8');

    expect(cssSource).toContain('.ha-nav-section + .ha-nav-section::before');
    expect(cssSource).toContain(".ha-navigation[data-expanded='false'] .ha-nav-section + .ha-nav-section::before");
    expect(cssSource).toContain('min-height: 36px');
  });
});
